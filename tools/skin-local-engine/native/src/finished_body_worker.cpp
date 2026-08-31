#include <windows.h>
#include <fcntl.h>
#include <io.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "embedded_finished_body_ptx.hpp"

namespace {

using Clock = std::chrono::steady_clock;
using CUresult = int;
using CUdevice = int;
using CUdeviceptr = unsigned long long;
struct CUctx_st;
struct CUmod_st;
struct CUfunc_st;
struct CUevent_st;
struct CUstream_st;
using CUcontext = CUctx_st*;
using CUmodule = CUmod_st*;
using CUfunction = CUfunc_st*;
using CUevent = CUevent_st*;
using CUstream = CUstream_st*;

constexpr std::uint16_t kFrameVersion = 1;
constexpr std::uint16_t kReady = 0;
constexpr std::uint16_t kUploadSnapshot = 10;
constexpr std::uint16_t kSnapshotAccepted = 11;
constexpr std::uint16_t kEvaluateGrid = 12;
constexpr std::uint16_t kGridResult = 13;
constexpr std::uint16_t kError = 255;
constexpr std::size_t kMaximumFrameBytes = 64ull * 1024ull * 1024ull;
constexpr std::size_t kSnapshotHeaderBytes = 128;
constexpr std::size_t kGridHeaderBytes = 96;
constexpr std::size_t kAckHeaderBytes = 96;
constexpr std::size_t kResultHeaderBytes = 160;
constexpr std::uint32_t kMaximumPrimitives = 1'000'000;
constexpr std::uint32_t kMaximumSamples = 1'000'000;

struct alignas(16) Float4 { float x, y, z, w; };
struct alignas(16) Capsule { Float4 start, end; };
static_assert(sizeof(Float4) == 16);
static_assert(sizeof(Capsule) == 32);

double milliseconds(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

std::uint16_t readU16(std::string_view value, std::size_t offset) {
  return static_cast<std::uint16_t>(static_cast<unsigned char>(value[offset]))
      | static_cast<std::uint16_t>(static_cast<unsigned char>(value[offset + 1]) << 8);
}

std::uint32_t readU32(std::string_view value, std::size_t offset) {
  std::uint32_t result = 0;
  for (std::size_t index = 0; index < 4; ++index) {
    result |= static_cast<std::uint32_t>(static_cast<unsigned char>(value[offset + index])) << (index * 8);
  }
  return result;
}

float readF32(std::string_view value, std::size_t offset) {
  const std::uint32_t bits = readU32(value, offset);
  float result = 0;
  std::memcpy(&result, &bits, sizeof(result));
  return result;
}

void writeU16(std::string& value, std::size_t offset, std::uint16_t number) {
  value[offset] = static_cast<char>(number & 0xff);
  value[offset + 1] = static_cast<char>((number >> 8) & 0xff);
}

void writeU32(std::string& value, std::size_t offset, std::uint32_t number) {
  for (std::size_t index = 0; index < 4; ++index) {
    value[offset + index] = static_cast<char>((number >> (index * 8)) & 0xff);
  }
}

void writeU64(std::string& value, std::size_t offset, std::uint64_t number) {
  for (std::size_t index = 0; index < 8; ++index) {
    value[offset + index] = static_cast<char>((number >> (index * 8)) & 0xff);
  }
}

void writeF64(std::string& value, std::size_t offset, double number) {
  std::uint64_t bits = 0;
  std::memcpy(&bits, &number, sizeof(bits));
  writeU64(value, offset, bits);
}

void requireFinite(float value, std::string_view label) {
  if (!std::isfinite(value)) throw std::runtime_error(std::string(label) + " must be finite");
}

struct Frame { std::uint16_t kind = 0; std::string payload; };

bool readFrame(Frame& frame) {
  char header[16]{};
  std::cin.read(header, sizeof(header));
  if (std::cin.gcount() == 0 && std::cin.eof()) return false;
  if (std::cin.gcount() != sizeof(header) || std::string_view(header, 4) != "KCF1") {
    throw std::runtime_error("truncated or invalid worker frame header");
  }
  const std::string_view view(header, sizeof(header));
  if (readU16(view, 4) != kFrameVersion) throw std::runtime_error("unsupported worker frame version");
  frame.kind = readU16(view, 6);
  std::uint64_t byteLength = 0;
  for (std::size_t index = 0; index < 8; ++index) {
    byteLength |= static_cast<std::uint64_t>(static_cast<unsigned char>(header[8 + index])) << (index * 8);
  }
  if (byteLength > kMaximumFrameBytes) throw std::runtime_error("worker frame exceeds fixed limit");
  frame.payload.resize(static_cast<std::size_t>(byteLength));
  if (byteLength > 0) {
    std::cin.read(frame.payload.data(), static_cast<std::streamsize>(byteLength));
    if (std::cin.gcount() != static_cast<std::streamsize>(byteLength)) {
      throw std::runtime_error("truncated worker frame payload");
    }
  }
  return true;
}

void writeFrame(std::uint16_t kind, std::string_view payload) {
  char header[16]{'K', 'C', 'F', '1'};
  std::string headerValue(header, sizeof(header));
  writeU16(headerValue, 4, kFrameVersion);
  writeU16(headerValue, 6, kind);
  writeU64(headerValue, 8, payload.size());
  std::cout.write(headerValue.data(), headerValue.size());
  std::cout.write(payload.data(), static_cast<std::streamsize>(payload.size()));
  std::cout.flush();
  if (!std::cout) throw std::runtime_error("failed to write worker frame");
}

std::string errorPayload(std::string_view detail) {
  std::string escaped;
  escaped.reserve(detail.size());
  for (char character : detail) {
    if (character == '"' || character == '\\') escaped.push_back('\\');
    escaped.push_back(character == '\n' || character == '\r' ? ' ' : character);
  }
  return "{\"code\":\"finished_body_shadow_failed\",\"detail\":\"" + escaped
      + "\",\"shadow\":true,\"productionApplied\":false}";
}

struct Snapshot {
  std::array<unsigned char, 32> fingerprint{};
  float hostK = 0;
  float roundK = 0;
  float halfThickness = 0;
  float capsuleBlend = 0;
  std::vector<Float4> host;
  std::vector<Float4> flat;
  std::vector<Float4> raised;
  std::vector<Capsule> capsules;
};

Snapshot decodeSnapshot(std::string_view payload) {
  if (payload.size() < kSnapshotHeaderBytes || payload.substr(0, 4) != "KFS1"
      || readU16(payload, 4) != 1 || readU16(payload, 6) != 1
      || readU32(payload, 8) != kSnapshotHeaderBytes) {
    throw std::runtime_error("invalid Finished BODY snapshot contract");
  }
  Snapshot snapshot;
  std::memcpy(snapshot.fingerprint.data(), payload.data() + 16, snapshot.fingerprint.size());
  snapshot.hostK = readF32(payload, 48);
  snapshot.roundK = readF32(payload, 52);
  snapshot.halfThickness = readF32(payload, 56);
  snapshot.capsuleBlend = readF32(payload, 60);
  requireFinite(snapshot.hostK, "hostK");
  requireFinite(snapshot.roundK, "roundK");
  requireFinite(snapshot.halfThickness, "halfThickness");
  requireFinite(snapshot.capsuleBlend, "capsuleBlend");
  if (!(snapshot.hostK > 0) || !(snapshot.roundK > 0) || !(snapshot.halfThickness > 0)) {
    throw std::runtime_error("Finished BODY snapshot parameters must be positive");
  }
  const auto hostCount = readU32(payload, 64);
  const auto flatCount = readU32(payload, 68);
  const auto raisedCount = readU32(payload, 72);
  const auto capsuleCount = readU32(payload, 76);
  if (hostCount < 1 || hostCount > kMaximumPrimitives || flatCount + raisedCount > kMaximumPrimitives
      || capsuleCount > kMaximumPrimitives || (capsuleCount > 0 && !(snapshot.capsuleBlend > 0))) {
    throw std::runtime_error("Finished BODY primitive count or capsule blend is invalid");
  }
  const auto hostOffset = readU32(payload, 80);
  const auto flatOffset = readU32(payload, 84);
  const auto raisedOffset = readU32(payload, 88);
  const auto capsuleOffset = readU32(payload, 92);
  const auto totalBytes = readU32(payload, 96);
  const std::uint64_t expectedFlat = kSnapshotHeaderBytes + static_cast<std::uint64_t>(hostCount) * sizeof(Float4);
  const std::uint64_t expectedRaised = expectedFlat + static_cast<std::uint64_t>(flatCount) * sizeof(Float4);
  const std::uint64_t expectedCapsules = expectedRaised + static_cast<std::uint64_t>(raisedCount) * sizeof(Float4);
  const std::uint64_t expectedTotal = expectedCapsules + static_cast<std::uint64_t>(capsuleCount) * sizeof(Capsule);
  if (hostOffset != kSnapshotHeaderBytes || flatOffset != expectedFlat || raisedOffset != expectedRaised
      || capsuleOffset != expectedCapsules || totalBytes != expectedTotal || payload.size() != expectedTotal) {
    throw std::runtime_error("Finished BODY snapshot offsets or byte length are inconsistent");
  }
  auto copyFloat4 = [&](std::uint32_t count, std::uint32_t offset, std::vector<Float4>& target) {
    target.resize(count);
    if (count > 0) std::memcpy(target.data(), payload.data() + offset, count * sizeof(Float4));
    for (const auto& point : target) {
      requireFinite(point.x, "point.x"); requireFinite(point.y, "point.y");
      requireFinite(point.z, "point.z"); requireFinite(point.w, "point.radius");
      if (!(point.w > 0)) throw std::runtime_error("point radius must be positive");
    }
  };
  copyFloat4(hostCount, hostOffset, snapshot.host);
  copyFloat4(flatCount, flatOffset, snapshot.flat);
  copyFloat4(raisedCount, raisedOffset, snapshot.raised);
  snapshot.capsules.resize(capsuleCount);
  if (capsuleCount > 0) std::memcpy(snapshot.capsules.data(), payload.data() + capsuleOffset, capsuleCount * sizeof(Capsule));
  for (const auto& capsule : snapshot.capsules) {
    requireFinite(capsule.start.x, "capsule.start.x"); requireFinite(capsule.start.y, "capsule.start.y");
    requireFinite(capsule.start.z, "capsule.start.z"); requireFinite(capsule.start.w, "capsule.radius");
    requireFinite(capsule.end.x, "capsule.end.x"); requireFinite(capsule.end.y, "capsule.end.y");
    requireFinite(capsule.end.z, "capsule.end.z");
    if (!(capsule.start.w > 0)) throw std::runtime_error("capsule radius must be positive");
  }
  return snapshot;
}

struct Grid {
  std::array<unsigned char, 32> fingerprint{};
  float minX = 0, minY = 0, minZ = 0, step = 0;
  std::uint32_t sizeX = 0, sizeY = 0, sizeZ = 0, sampleCount = 0;
};

Grid decodeGrid(std::string_view payload) {
  if (payload.size() != kGridHeaderBytes || payload.substr(0, 4) != "KFG1"
      || readU16(payload, 4) != 1 || readU16(payload, 6) != 2
      || readU32(payload, 8) != kGridHeaderBytes || readU32(payload, 80) != kGridHeaderBytes) {
    throw std::runtime_error("invalid Finished BODY grid request contract");
  }
  Grid grid;
  std::memcpy(grid.fingerprint.data(), payload.data() + 16, grid.fingerprint.size());
  grid.minX = readF32(payload, 48); grid.minY = readF32(payload, 52);
  grid.minZ = readF32(payload, 56); grid.step = readF32(payload, 60);
  grid.sizeX = readU32(payload, 64); grid.sizeY = readU32(payload, 68);
  grid.sizeZ = readU32(payload, 72); grid.sampleCount = readU32(payload, 76);
  requireFinite(grid.minX, "grid.minX"); requireFinite(grid.minY, "grid.minY");
  requireFinite(grid.minZ, "grid.minZ"); requireFinite(grid.step, "grid.step");
  const std::uint64_t expected = static_cast<std::uint64_t>(grid.sizeX) * grid.sizeY * grid.sizeZ;
  if (!(grid.step > 0) || grid.sizeX < 1 || grid.sizeY < 1 || grid.sizeZ < 1
      || expected != grid.sampleCount || grid.sampleCount > kMaximumSamples) {
    throw std::runtime_error("Finished BODY grid dimensions are invalid");
  }
  return grid;
}

class CudaFinishedBody {
 public:
  CudaFinishedBody() {
    library_ = LoadLibraryExW(L"nvcuda.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!library_) throw std::runtime_error("nvcuda.dll is unavailable in System32");
    cuInit_ = symbol<Init>("cuInit"); cuDeviceGetCount_ = symbol<DeviceGetCount>("cuDeviceGetCount");
    cuDeviceGet_ = symbol<DeviceGet>("cuDeviceGet"); cuDeviceGetName_ = symbol<DeviceGetName>("cuDeviceGetName");
    cuCtxCreate_ = symbolAny<CtxCreate>({"cuCtxCreate_v2", "cuCtxCreate"});
    cuCtxDestroy_ = symbolAny<CtxDestroy>({"cuCtxDestroy_v2", "cuCtxDestroy"});
    cuModuleLoadDataEx_ = symbol<ModuleLoadDataEx>("cuModuleLoadDataEx");
    cuModuleUnload_ = symbol<ModuleUnload>("cuModuleUnload");
    cuModuleGetFunction_ = symbol<ModuleGetFunction>("cuModuleGetFunction");
    cuMemAlloc_ = symbolAny<MemAlloc>({"cuMemAlloc_v2", "cuMemAlloc"});
    cuMemFree_ = symbolAny<MemFree>({"cuMemFree_v2", "cuMemFree"});
    cuMemcpyHtoD_ = symbolAny<MemcpyHtoD>({"cuMemcpyHtoD_v2", "cuMemcpyHtoD"});
    cuMemcpyDtoH_ = symbolAny<MemcpyDtoH>({"cuMemcpyDtoH_v2", "cuMemcpyDtoH"});
    cuLaunchKernel_ = symbol<LaunchKernel>("cuLaunchKernel");
    cuEventCreate_ = symbol<EventCreate>("cuEventCreate"); cuEventRecord_ = symbol<EventRecord>("cuEventRecord");
    cuEventSynchronize_ = symbol<EventSynchronize>("cuEventSynchronize");
    cuEventElapsedTime_ = symbol<EventElapsedTime>("cuEventElapsedTime");
    cuEventDestroy_ = symbolAny<EventDestroy>({"cuEventDestroy_v2", "cuEventDestroy"});
  }

  ~CudaFinishedBody() {
    if (startEvent_) cuEventDestroy_(startEvent_); if (stopEvent_) cuEventDestroy_(stopEvent_);
    freeBuffer(host_); freeBuffer(flat_); freeBuffer(raised_); freeBuffer(capsules_); freeBuffer(outputs_);
    if (module_) cuModuleUnload_(module_); if (context_) cuCtxDestroy_(context_); if (library_) FreeLibrary(library_);
  }

  void initialize() {
    const auto started = Clock::now();
    check(cuInit_(0), "cuInit"); int count = 0; check(cuDeviceGetCount_(&count), "cuDeviceGetCount");
    if (count < 1) throw std::runtime_error("CUDA driver reports no devices");
    check(cuDeviceGet_(&device_, 0), "cuDeviceGet"); char name[256]{};
    check(cuDeviceGetName_(name, sizeof(name), device_), "cuDeviceGetName"); deviceName_ = name;
    check(cuCtxCreate_(&context_, 0, device_), "cuCtxCreate");
    check(cuModuleLoadDataEx_(&module_, kKatachiFinishedBodyPtx, 0, nullptr, nullptr), "cuModuleLoadDataEx");
    check(cuModuleGetFunction_(&kernel_, module_, "evaluate_finished_body_sdf_kernel"), "cuModuleGetFunction");
    check(cuEventCreate_(&startEvent_, 0), "cuEventCreate(start)");
    check(cuEventCreate_(&stopEvent_, 0), "cuEventCreate(stop)");
    initializationMilliseconds_ = milliseconds(started);
  }

  struct UploadTiming { double decode = 0, buffer = 0, hostToDevice = 0, total = 0; };
  UploadTiming upload(const Snapshot& snapshot, double decodeMilliseconds) {
    const auto totalStart = Clock::now(); UploadTiming timing; timing.decode = decodeMilliseconds;
    const auto bufferStart = Clock::now();
    ensureBuffer(host_, snapshot.host.size() * sizeof(Float4));
    ensureBuffer(flat_, snapshot.flat.size() * sizeof(Float4));
    ensureBuffer(raised_, snapshot.raised.size() * sizeof(Float4));
    ensureBuffer(capsules_, snapshot.capsules.size() * sizeof(Capsule));
    timing.buffer = milliseconds(bufferStart);
    const auto copyStart = Clock::now();
    copyToDevice(host_, snapshot.host); copyToDevice(flat_, snapshot.flat); copyToDevice(raised_, snapshot.raised);
    copyToDevice(capsules_, snapshot.capsules);
    timing.hostToDevice = milliseconds(copyStart);
    snapshot_ = snapshot; hasSnapshot_ = true; timing.total = milliseconds(totalStart); return timing;
  }

  struct GridTiming { double decode = 0, buffer = 0, kernel = 0, deviceToHost = 0, total = 0; bool outputReused = false; };
  std::pair<std::vector<float>, GridTiming> evaluate(const Grid& grid, double decodeMilliseconds) {
    const auto totalStart = Clock::now(); GridTiming timing; timing.decode = decodeMilliseconds;
    if (!hasSnapshot_ || grid.fingerprint != snapshot_.fingerprint) throw std::runtime_error("stale or absent Finished BODY snapshot");
    const auto bufferStart = Clock::now(); timing.outputReused = ensureBuffer(outputs_, grid.sampleCount * sizeof(float));
    timing.buffer = milliseconds(bufferStart);
    CUdeviceptr host = host_.pointer, flat = flat_.pointer, raised = raised_.pointer;
    CUdeviceptr capsules = capsules_.pointer, outputs = outputs_.pointer;
    std::uint32_t hostCount = static_cast<std::uint32_t>(snapshot_.host.size());
    std::uint32_t flatCount = static_cast<std::uint32_t>(snapshot_.flat.size());
    std::uint32_t raisedCount = static_cast<std::uint32_t>(snapshot_.raised.size());
    std::uint32_t capsuleCount = static_cast<std::uint32_t>(snapshot_.capsules.size());
    float hostK = snapshot_.hostK, roundK = snapshot_.roundK, halfThickness = snapshot_.halfThickness;
    float capsuleBlend = snapshot_.capsuleBlend, minX = grid.minX, minY = grid.minY, minZ = grid.minZ, step = grid.step;
    std::uint32_t sizeX = grid.sizeX, sizeY = grid.sizeY, sampleCount = grid.sampleCount;
    void* parameters[] = {&host, &hostCount, &hostK, &flat, &flatCount, &raised, &raisedCount,
      &roundK, &halfThickness, &capsules, &capsuleCount, &capsuleBlend, &minX, &minY, &minZ,
      &step, &sizeX, &sizeY, &sampleCount, &outputs};
    constexpr unsigned block = 256; const unsigned blocks = (sampleCount + block - 1) / block;
    check(cuEventRecord_(startEvent_, nullptr), "cuEventRecord(start)");
    check(cuLaunchKernel_(kernel_, blocks, 1, 1, block, 1, 1, 0, nullptr, parameters, nullptr), "cuLaunchKernel");
    check(cuEventRecord_(stopEvent_, nullptr), "cuEventRecord(stop)");
    check(cuEventSynchronize_(stopEvent_), "cuEventSynchronize(stop)"); float kernel = 0;
    check(cuEventElapsedTime_(&kernel, startEvent_, stopEvent_), "cuEventElapsedTime"); timing.kernel = kernel;
    std::vector<float> values(sampleCount); const auto copyStart = Clock::now();
    check(cuMemcpyDtoH_(values.data(), outputs_.pointer, values.size() * sizeof(float)), "cuMemcpyDtoH(outputs)");
    timing.deviceToHost = milliseconds(copyStart); timing.total = milliseconds(totalStart); return {std::move(values), timing};
  }

  const std::string& deviceName() const { return deviceName_; }
  double initializationMilliseconds() const { return initializationMilliseconds_; }

 private:
  struct Buffer { CUdeviceptr pointer = 0; std::size_t capacity = 0; };
  using Init = CUresult(WINAPI*)(unsigned); using DeviceGetCount = CUresult(WINAPI*)(int*);
  using DeviceGet = CUresult(WINAPI*)(CUdevice*, int); using DeviceGetName = CUresult(WINAPI*)(char*, int, CUdevice);
  using CtxCreate = CUresult(WINAPI*)(CUcontext*, unsigned, CUdevice); using CtxDestroy = CUresult(WINAPI*)(CUcontext);
  using ModuleLoadDataEx = CUresult(WINAPI*)(CUmodule*, const void*, unsigned, int*, void**);
  using ModuleUnload = CUresult(WINAPI*)(CUmodule); using ModuleGetFunction = CUresult(WINAPI*)(CUfunction*, CUmodule, const char*);
  using MemAlloc = CUresult(WINAPI*)(CUdeviceptr*, std::size_t); using MemFree = CUresult(WINAPI*)(CUdeviceptr);
  using MemcpyHtoD = CUresult(WINAPI*)(CUdeviceptr, const void*, std::size_t);
  using MemcpyDtoH = CUresult(WINAPI*)(void*, CUdeviceptr, std::size_t);
  using LaunchKernel = CUresult(WINAPI*)(CUfunction, unsigned, unsigned, unsigned, unsigned, unsigned, unsigned, unsigned, CUstream, void**, void**);
  using EventCreate = CUresult(WINAPI*)(CUevent*, unsigned); using EventRecord = CUresult(WINAPI*)(CUevent, CUstream);
  using EventSynchronize = CUresult(WINAPI*)(CUevent); using EventElapsedTime = CUresult(WINAPI*)(float*, CUevent, CUevent);
  using EventDestroy = CUresult(WINAPI*)(CUevent);
  template<typename T> T symbol(const char* name) { auto value = reinterpret_cast<T>(GetProcAddress(library_, name)); if (!value) throw std::runtime_error(std::string("missing nvcuda symbol ") + name); return value; }
  template<typename T> T symbolAny(std::initializer_list<const char*> names) { for (auto name : names) { auto value = reinterpret_cast<T>(GetProcAddress(library_, name)); if (value) return value; } throw std::runtime_error("missing versioned nvcuda symbol"); }
  void check(CUresult result, std::string_view operation) { if (result != 0) throw std::runtime_error(std::string(operation) + " failed with CUDA error " + std::to_string(result)); }
  bool ensureBuffer(Buffer& buffer, std::size_t bytes) { if (bytes == 0) return buffer.pointer == 0; if (buffer.pointer && bytes <= buffer.capacity) return true; freeBuffer(buffer); std::size_t capacity = 256; while (capacity < bytes) capacity *= 2; check(cuMemAlloc_(&buffer.pointer, capacity), "cuMemAlloc"); buffer.capacity = capacity; return false; }
  void freeBuffer(Buffer& buffer) { if (buffer.pointer) cuMemFree_(buffer.pointer); buffer = {}; }
  template<typename T> void copyToDevice(const Buffer& buffer, const std::vector<T>& values) { if (!values.empty()) check(cuMemcpyHtoD_(buffer.pointer, values.data(), values.size() * sizeof(T)), "cuMemcpyHtoD"); }
  HMODULE library_ = nullptr; Init cuInit_ = nullptr; DeviceGetCount cuDeviceGetCount_ = nullptr; DeviceGet cuDeviceGet_ = nullptr; DeviceGetName cuDeviceGetName_ = nullptr;
  CtxCreate cuCtxCreate_ = nullptr; CtxDestroy cuCtxDestroy_ = nullptr; ModuleLoadDataEx cuModuleLoadDataEx_ = nullptr; ModuleUnload cuModuleUnload_ = nullptr; ModuleGetFunction cuModuleGetFunction_ = nullptr;
  MemAlloc cuMemAlloc_ = nullptr; MemFree cuMemFree_ = nullptr; MemcpyHtoD cuMemcpyHtoD_ = nullptr; MemcpyDtoH cuMemcpyDtoH_ = nullptr; LaunchKernel cuLaunchKernel_ = nullptr;
  EventCreate cuEventCreate_ = nullptr; EventRecord cuEventRecord_ = nullptr; EventSynchronize cuEventSynchronize_ = nullptr; EventElapsedTime cuEventElapsedTime_ = nullptr; EventDestroy cuEventDestroy_ = nullptr;
  CUdevice device_ = 0; CUcontext context_ = nullptr; CUmodule module_ = nullptr; CUfunction kernel_ = nullptr; CUevent startEvent_ = nullptr; CUevent stopEvent_ = nullptr;
  Buffer host_, flat_, raised_, capsules_, outputs_; Snapshot snapshot_; bool hasSnapshot_ = false; std::string deviceName_; double initializationMilliseconds_ = 0;
};

std::string snapshotAck(const Snapshot& snapshot, const CudaFinishedBody::UploadTiming& timing) {
  std::string response(kAckHeaderBytes, '\0'); std::memcpy(response.data(), "KFA1", 4);
  writeU16(response, 4, 1); writeU16(response, 6, 1); writeU32(response, 8, kAckHeaderBytes);
  std::memcpy(response.data() + 16, snapshot.fingerprint.data(), snapshot.fingerprint.size());
  writeF64(response, 48, timing.decode); writeF64(response, 56, timing.buffer);
  writeF64(response, 64, timing.hostToDevice); writeF64(response, 72, timing.total);
  writeU32(response, 80, kAckHeaderBytes); return response;
}

std::string gridResponse(const Grid& grid, const std::vector<float>& values, const CudaFinishedBody::GridTiming& timing) {
  const std::size_t total = kResultHeaderBytes + values.size() * sizeof(float); std::string response(total, '\0');
  std::memcpy(response.data(), "KFR1", 4); writeU16(response, 4, 1); writeU16(response, 6, 2); writeU32(response, 8, kResultHeaderBytes);
  writeU32(response, 12, timing.outputReused ? 1u : 0u); std::memcpy(response.data() + 16, grid.fingerprint.data(), grid.fingerprint.size());
  writeU32(response, 48, grid.sampleCount); writeU32(response, 52, kResultHeaderBytes); writeU32(response, 56, static_cast<std::uint32_t>(total));
  writeF64(response, 64, timing.decode); writeF64(response, 72, timing.buffer); writeF64(response, 80, 0.0);
  writeF64(response, 88, timing.kernel); writeF64(response, 96, timing.deviceToHost); writeF64(response, 104, timing.total);
  writeU32(response, 112, grid.sizeX); writeU32(response, 116, grid.sizeY); writeU32(response, 120, grid.sizeZ);
  if (!values.empty()) std::memcpy(response.data() + kResultHeaderBytes, values.data(), values.size() * sizeof(float));
  return response;
}

int run() {
  _setmode(_fileno(stdin), _O_BINARY); _setmode(_fileno(stdout), _O_BINARY);
  CudaFinishedBody cuda; cuda.initialize();
  std::ostringstream ready;
  ready << "{\"contract\":\"katachi.cuda-finished-body-worker-ready.v1\",\"deviceName\":\""
        << cuda.deviceName() << "\",\"initializationMilliseconds\":" << cuda.initializationMilliseconds()
        << ",\"shadow\":true,\"productionApplied\":false}";
  writeFrame(kReady, ready.str());
  Frame frame;
  while (readFrame(frame)) {
    try {
      if (frame.kind == kUploadSnapshot) {
        const auto decodeStart = Clock::now(); Snapshot snapshot = decodeSnapshot(frame.payload);
        const auto timing = cuda.upload(snapshot, milliseconds(decodeStart)); writeFrame(kSnapshotAccepted, snapshotAck(snapshot, timing));
      } else if (frame.kind == kEvaluateGrid) {
        const auto decodeStart = Clock::now(); Grid grid = decodeGrid(frame.payload);
        auto [values, timing] = cuda.evaluate(grid, milliseconds(decodeStart)); writeFrame(kGridResult, gridResponse(grid, values, timing));
      } else throw std::runtime_error("unsupported Finished BODY worker frame kind");
    } catch (const std::exception& error) { writeFrame(kError, errorPayload(error.what())); }
  }
  return 0;
}

}  // namespace

int main() {
  try { return run(); }
  catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
