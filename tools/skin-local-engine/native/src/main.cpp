#include <windows.h>
#include <fcntl.h>
#include <io.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <variant>
#include <vector>

#include "embedded_ptx.hpp"

namespace json {

struct Value;
using Array = std::vector<Value>;
using Object = std::map<std::string, Value, std::less<>>;

struct Value {
  using Storage = std::variant<std::nullptr_t, bool, double, std::string, Array, Object>;
  Storage storage = nullptr;

  Value() = default;
  Value(std::nullptr_t) : storage(nullptr) {}
  Value(bool value) : storage(value) {}
  Value(double value) : storage(value) {}
  Value(int value) : storage(static_cast<double>(value)) {}
  Value(unsigned value) : storage(static_cast<double>(value)) {}
  Value(std::string value) : storage(std::move(value)) {}
  Value(const char* value) : storage(std::string(value)) {}
  Value(Array value) : storage(std::move(value)) {}
  Value(Object value) : storage(std::move(value)) {}

  const Object& object() const {
    const auto* result = std::get_if<Object>(&storage);
    if (!result) throw std::runtime_error("JSON value is not an object");
    return *result;
  }
  const Array& array() const {
    const auto* result = std::get_if<Array>(&storage);
    if (!result) throw std::runtime_error("JSON value is not an array");
    return *result;
  }
  const std::string& string() const {
    const auto* result = std::get_if<std::string>(&storage);
    if (!result) throw std::runtime_error("JSON value is not a string");
    return *result;
  }
  double number() const {
    const auto* result = std::get_if<double>(&storage);
    if (!result) throw std::runtime_error("JSON value is not a number");
    return *result;
  }
};

class Parser {
 public:
  explicit Parser(std::string_view text) : text_(text) {}

  Value parse() {
    Value value = parseValue();
    whitespace();
    if (position_ != text_.size()) fail("unexpected trailing content");
    return value;
  }

 private:
  std::string_view text_;
  std::size_t position_ = 0;

  [[noreturn]] void fail(const std::string& detail) const {
    throw std::runtime_error("JSON parse error at byte " + std::to_string(position_) + ": " + detail);
  }

  void whitespace() {
    while (position_ < text_.size()) {
      const char c = text_[position_];
      if (c != ' ' && c != '\t' && c != '\r' && c != '\n') break;
      ++position_;
    }
  }

  bool consume(char expected) {
    whitespace();
    if (position_ < text_.size() && text_[position_] == expected) {
      ++position_;
      return true;
    }
    return false;
  }

  void expect(char expected) {
    if (!consume(expected)) fail(std::string("expected '") + expected + "'");
  }

  Value parseValue() {
    whitespace();
    if (position_ >= text_.size()) fail("expected a value");
    switch (text_[position_]) {
      case '{': return parseObject();
      case '[': return parseArray();
      case '"': return Value(parseString());
      case 't': return parseLiteral("true", Value(true));
      case 'f': return parseLiteral("false", Value(false));
      case 'n': return parseLiteral("null", Value(nullptr));
      default:
        if (text_[position_] == '-' || (text_[position_] >= '0' && text_[position_] <= '9')) {
          return Value(parseNumber());
        }
        fail("unexpected token");
    }
  }

  Value parseLiteral(std::string_view literal, Value value) {
    if (text_.substr(position_, literal.size()) != literal) fail("invalid literal");
    position_ += literal.size();
    return value;
  }

  Object parseObject() {
    expect('{');
    Object object;
    if (consume('}')) return object;
    for (;;) {
      whitespace();
      if (position_ >= text_.size() || text_[position_] != '"') fail("object key must be a string");
      std::string key = parseString();
      expect(':');
      if (!object.emplace(key, parseValue()).second) fail("duplicate object key: " + key);
      if (consume('}')) break;
      expect(',');
    }
    return object;
  }

  Array parseArray() {
    expect('[');
    Array array;
    if (consume(']')) return array;
    for (;;) {
      array.push_back(parseValue());
      if (consume(']')) break;
      expect(',');
    }
    return array;
  }

  static void appendUtf8(std::string& output, std::uint32_t codePoint) {
    if (codePoint <= 0x7f) {
      output.push_back(static_cast<char>(codePoint));
    } else if (codePoint <= 0x7ff) {
      output.push_back(static_cast<char>(0xc0 | (codePoint >> 6)));
      output.push_back(static_cast<char>(0x80 | (codePoint & 0x3f)));
    } else if (codePoint <= 0xffff) {
      output.push_back(static_cast<char>(0xe0 | (codePoint >> 12)));
      output.push_back(static_cast<char>(0x80 | ((codePoint >> 6) & 0x3f)));
      output.push_back(static_cast<char>(0x80 | (codePoint & 0x3f)));
    } else {
      output.push_back(static_cast<char>(0xf0 | (codePoint >> 18)));
      output.push_back(static_cast<char>(0x80 | ((codePoint >> 12) & 0x3f)));
      output.push_back(static_cast<char>(0x80 | ((codePoint >> 6) & 0x3f)));
      output.push_back(static_cast<char>(0x80 | (codePoint & 0x3f)));
    }
  }

  std::uint32_t parseHex4() {
    if (position_ + 4 > text_.size()) fail("short unicode escape");
    std::uint32_t value = 0;
    for (int i = 0; i < 4; ++i) {
      const char c = text_[position_++];
      value <<= 4;
      if (c >= '0' && c <= '9') value |= static_cast<std::uint32_t>(c - '0');
      else if (c >= 'a' && c <= 'f') value |= static_cast<std::uint32_t>(c - 'a' + 10);
      else if (c >= 'A' && c <= 'F') value |= static_cast<std::uint32_t>(c - 'A' + 10);
      else fail("invalid unicode escape");
    }
    return value;
  }

  std::string parseString() {
    if (position_ >= text_.size() || text_[position_++] != '"') fail("expected string");
    std::string output;
    while (position_ < text_.size()) {
      const unsigned char c = static_cast<unsigned char>(text_[position_++]);
      if (c == '"') return output;
      if (c < 0x20) fail("unescaped control character");
      if (c != '\\') {
        output.push_back(static_cast<char>(c));
        continue;
      }
      if (position_ >= text_.size()) fail("unfinished escape");
      const char escaped = text_[position_++];
      switch (escaped) {
        case '"': output.push_back('"'); break;
        case '\\': output.push_back('\\'); break;
        case '/': output.push_back('/'); break;
        case 'b': output.push_back('\b'); break;
        case 'f': output.push_back('\f'); break;
        case 'n': output.push_back('\n'); break;
        case 'r': output.push_back('\r'); break;
        case 't': output.push_back('\t'); break;
        case 'u': {
          std::uint32_t codePoint = parseHex4();
          if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
            if (position_ + 2 > text_.size() || text_[position_] != '\\' || text_[position_ + 1] != 'u') {
              fail("high surrogate without low surrogate");
            }
            position_ += 2;
            const std::uint32_t low = parseHex4();
            if (low < 0xdc00 || low > 0xdfff) fail("invalid low surrogate");
            codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
          } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
            fail("unexpected low surrogate");
          }
          appendUtf8(output, codePoint);
          break;
        }
        default: fail("invalid string escape");
      }
    }
    fail("unterminated string");
  }

  double parseNumber() {
    const std::size_t start = position_;
    if (text_[position_] == '-') ++position_;
    if (position_ >= text_.size()) fail("unfinished number");
    if (text_[position_] == '0') {
      ++position_;
    } else {
      if (text_[position_] < '1' || text_[position_] > '9') fail("invalid number");
      while (position_ < text_.size() && text_[position_] >= '0' && text_[position_] <= '9') ++position_;
    }
    if (position_ < text_.size() && text_[position_] == '.') {
      ++position_;
      const std::size_t digits = position_;
      while (position_ < text_.size() && text_[position_] >= '0' && text_[position_] <= '9') ++position_;
      if (digits == position_) fail("fraction requires digits");
    }
    if (position_ < text_.size() && (text_[position_] == 'e' || text_[position_] == 'E')) {
      ++position_;
      if (position_ < text_.size() && (text_[position_] == '+' || text_[position_] == '-')) ++position_;
      const std::size_t digits = position_;
      while (position_ < text_.size() && text_[position_] >= '0' && text_[position_] <= '9') ++position_;
      if (digits == position_) fail("exponent requires digits");
    }
    const std::string token(text_.substr(start, position_ - start));
    char* end = nullptr;
    const double value = std::strtod(token.c_str(), &end);
    if (!end || *end != '\0' || !std::isfinite(value)) fail("number must be finite");
    return value;
  }
};

void escapeString(std::ostream& output, std::string_view value) {
  output << '"';
  for (const unsigned char c : value) {
    switch (c) {
      case '"': output << "\\\""; break;
      case '\\': output << "\\\\"; break;
      case '\b': output << "\\b"; break;
      case '\f': output << "\\f"; break;
      case '\n': output << "\\n"; break;
      case '\r': output << "\\r"; break;
      case '\t': output << "\\t"; break;
      default:
        if (c < 0x20) {
          output << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                 << static_cast<unsigned>(c) << std::dec << std::setfill(' ');
        } else {
          output << static_cast<char>(c);
        }
    }
  }
  output << '"';
}

void dump(std::ostream& output, const Value& value) {
  if (std::holds_alternative<std::nullptr_t>(value.storage)) {
    output << "null";
  } else if (const auto* boolean = std::get_if<bool>(&value.storage)) {
    output << (*boolean ? "true" : "false");
  } else if (const auto* number = std::get_if<double>(&value.storage)) {
    if (!std::isfinite(*number)) throw std::runtime_error("refusing to serialize non-finite JSON number");
    output << std::setprecision(17) << *number;
  } else if (const auto* string = std::get_if<std::string>(&value.storage)) {
    escapeString(output, *string);
  } else if (const auto* array = std::get_if<Array>(&value.storage)) {
    output << '[';
    for (std::size_t i = 0; i < array->size(); ++i) {
      if (i) output << ',';
      dump(output, (*array)[i]);
    }
    output << ']';
  } else {
    const auto& object = std::get<Object>(value.storage);
    output << '{';
    bool first = true;
    for (const auto& [key, child] : object) {
      if (!first) output << ',';
      first = false;
      escapeString(output, key);
      output << ':';
      dump(output, child);
    }
    output << '}';
  }
}

std::string stringify(const Value& value) {
  std::ostringstream output;
  dump(output, value);
  return output.str();
}

}  // namespace json

namespace {

constexpr const char* kExecutableCapabilitiesContract =
    "katachi.cuda-containment-executable-capabilities.v1";
constexpr const char* kExecutableResultContract =
    "katachi.cuda-containment-executable-result.v1";
constexpr const char* kAlgorithmContract =
    "katachi.skin.evaluate-containment.metaball-radius.v1";
constexpr const char* kEngineVersion = "0.2.0-persistent-json-shadow";
constexpr std::size_t kMaximumSamples = 250'000;
constexpr std::size_t kMaximumBalls = 65'536;
constexpr std::uint64_t kMaximumFrameBytes = 64ull * 1024ull * 1024ull;
constexpr std::uint16_t kFrameProtocolVersion = 1;
constexpr std::uint16_t kFrameReady = 0;
constexpr std::uint16_t kFrameJsonRequest = 1;
constexpr std::uint16_t kFrameJsonResponse = 2;
constexpr std::uint16_t kFrameError = 255;

const json::Value& member(const json::Object& object, std::string_view key, std::string_view label) {
  const auto found = object.find(key);
  if (found == object.end()) {
    throw std::runtime_error(std::string(label) + "." + std::string(key) + " is required");
  }
  return found->second;
}

const json::Object& objectValue(const json::Value& value, std::string_view label) {
  try {
    return value.object();
  } catch (...) {
    throw std::runtime_error(std::string(label) + " must be an object");
  }
}

const json::Array& arrayValue(const json::Value& value, std::string_view label) {
  try {
    return value.array();
  } catch (...) {
    throw std::runtime_error(std::string(label) + " must be an array");
  }
}

std::string stringValue(const json::Value& value, std::string_view label, bool nonEmpty = true) {
  try {
    const std::string result = value.string();
    if (nonEmpty && result.empty()) throw std::runtime_error("empty");
    return result;
  } catch (...) {
    throw std::runtime_error(std::string(label) + (nonEmpty ? " must be a non-empty string" : " must be a string"));
  }
}

double numberValue(const json::Value& value, std::string_view label) {
  double number = 0.0;
  try {
    number = value.number();
  } catch (...) {
    throw std::runtime_error(std::string(label) + " must be a number");
  }
  if (!std::isfinite(number)) throw std::runtime_error(std::string(label) + " must be finite");
  return number;
}

std::int64_t integerValue(const json::Value& value, std::string_view label) {
  const double number = numberValue(value, label);
  if (std::trunc(number) != number
      || number < static_cast<double>(std::numeric_limits<std::int64_t>::min())
      || number > static_cast<double>(std::numeric_limits<std::int64_t>::max())) {
    throw std::runtime_error(std::string(label) + " must be an integer");
  }
  return static_cast<std::int64_t>(number);
}

float checkedFloat(const json::Value& value, std::string_view label) {
  const double number = numberValue(value, label);
  if (number < -static_cast<double>(std::numeric_limits<float>::max())
      || number > static_cast<double>(std::numeric_limits<float>::max())) {
    throw std::runtime_error(std::string(label) + " does not fit float32");
  }
  const float converted = static_cast<float>(number);
  if (!std::isfinite(converted)) throw std::runtime_error(std::string(label) + " is non-finite in float32");
  return converted;
}

struct alignas(16) Float4 {
  float x;
  float y;
  float z;
  float w;
};

struct alignas(16) KernelOutput {
  float baseSignedDistance;
  float radiusAdjustedMargin;
  float radiusClearance;
  std::uint32_t classification;
};

static_assert(sizeof(Float4) == 16);
static_assert(sizeof(KernelOutput) == 16);

struct Sample {
  std::string sampleId;
  std::string edgeId;
  Float4 value{};
};

struct Request {
  std::string clientRequestId;
  std::string projectFingerprint;
  std::string algorithmContract;
  double unitsPerMillimeter = 1.0;
  float smoothness = 0.0f;
  float boundaryTolerance = 0.0f;
  unsigned benchmarkIterations = 1;
  std::vector<Float4> balls;
  std::vector<Sample> samples;
};

Request validateRequest(const json::Value& rootValue) {
  const auto& root = objectValue(rootValue, "request");
  const auto& protocol = objectValue(member(root, "protocol", "request"), "request.protocol");
  if (integerValue(member(protocol, "major", "request.protocol"), "request.protocol.major") != 1) {
    throw std::runtime_error("request.protocol.major must be 1");
  }
  if (integerValue(member(protocol, "minor", "request.protocol"), "request.protocol.minor") < 0) {
    throw std::runtime_error("request.protocol.minor must be non-negative");
  }
  if (stringValue(member(root, "operation", "request"), "request.operation") != "evaluateContainment") {
    throw std::runtime_error("request.operation must be evaluateContainment");
  }

  Request request;
  request.algorithmContract = stringValue(member(root, "algorithmContract", "request"), "request.algorithmContract");
  if (request.algorithmContract != kAlgorithmContract) {
    throw std::runtime_error("unsupported request.algorithmContract");
  }
  request.clientRequestId = stringValue(member(root, "clientRequestId", "request"), "request.clientRequestId");
  request.projectFingerprint = stringValue(member(root, "projectFingerprint", "request"), "request.projectFingerprint");

  const auto& coordinate = objectValue(member(root, "coordinateContract", "request"), "request.coordinateContract");
  const std::string frame = stringValue(member(coordinate, "frame", "request.coordinateContract"), "request.coordinateContract.frame");
  if (frame != "object" && frame != "millimeter") throw std::runtime_error("coordinate frame must be object or millimeter");
  request.unitsPerMillimeter = numberValue(
      member(coordinate, "unitsPerMillimeter", "request.coordinateContract"),
      "request.coordinateContract.unitsPerMillimeter");
  if (!(request.unitsPerMillimeter > 0.0)) throw std::runtime_error("unitsPerMillimeter must be positive");
  if (stringValue(member(coordinate, "handedness", "request.coordinateContract"), "request.coordinateContract.handedness") != "right"
      || stringValue(member(coordinate, "buildAxis", "request.coordinateContract"), "request.coordinateContract.buildAxis") != "+z") {
    throw std::runtime_error("only right-handed +z coordinates are supported");
  }

  const auto& quality = objectValue(member(root, "quality", "request"), "request.quality");
  if (const auto found = quality.find("benchmarkIterations"); found != quality.end()) {
    const std::int64_t iterations = integerValue(found->second, "request.quality.benchmarkIterations");
    if (iterations < 1 || iterations > 10'000) {
      throw std::runtime_error("benchmarkIterations must be in [1,10000]");
    }
    request.benchmarkIterations = static_cast<unsigned>(iterations);
  }

  const auto& artifacts = arrayValue(member(root, "artifacts", "request"), "request.artifacts");
  if (!artifacts.empty()) throw std::runtime_error("prototype containment requests require empty artifacts");
  const auto& input = objectValue(member(root, "input", "request"), "request.input");
  const auto& base = objectValue(member(input, "base", "request.input"), "request.input.base");
  if (stringValue(member(base, "kind", "request.input.base"), "request.input.base.kind") != "metaball-smooth-union"
      || integerValue(member(base, "contractVersion", "request.input.base"), "request.input.base.contractVersion") != 1) {
    throw std::runtime_error("only metaball-smooth-union contractVersion 1 is supported");
  }
  request.smoothness = checkedFloat(member(base, "smoothness", "request.input.base"), "request.input.base.smoothness");
  if (!(request.smoothness > 0.0f)) throw std::runtime_error("base smoothness must be positive");
  request.boundaryTolerance = checkedFloat(
      member(input, "boundaryTolerance", "request.input"), "request.input.boundaryTolerance");
  if (request.boundaryTolerance < 0.0f) throw std::runtime_error("boundaryTolerance must be non-negative");

  const auto& balls = arrayValue(member(base, "balls", "request.input.base"), "request.input.base.balls");
  if (balls.empty() || balls.size() > kMaximumBalls) throw std::runtime_error("base.balls count is outside the prototype limit");
  request.balls.reserve(balls.size());
  std::set<std::int64_t> ballIds;
  for (std::size_t i = 0; i < balls.size(); ++i) {
    const std::string label = "request.input.base.balls[" + std::to_string(i) + "]";
    const auto& ball = objectValue(balls[i], label);
    const std::int64_t id = integerValue(member(ball, "id", label), label + ".id");
    if (!ballIds.insert(id).second) throw std::runtime_error("duplicate ball identity: " + std::to_string(id));
    const float radius = checkedFloat(member(ball, "r", label), label + ".r");
    if (!(radius > 0.0f)) throw std::runtime_error(label + ".r must be positive");
    request.balls.push_back({
        checkedFloat(member(ball, "x", label), label + ".x"),
        checkedFloat(member(ball, "y", label), label + ".y"),
        checkedFloat(member(ball, "z", label), label + ".z"),
        radius,
    });
  }

  const auto& samples = arrayValue(member(input, "samples", "request.input"), "request.input.samples");
  if (samples.size() > kMaximumSamples) throw std::runtime_error("sample count exceeds the prototype limit");
  request.samples.reserve(samples.size());
  std::set<std::string> sampleIds;
  for (std::size_t i = 0; i < samples.size(); ++i) {
    const std::string label = "request.input.samples[" + std::to_string(i) + "]";
    const auto& sample = objectValue(samples[i], label);
    Sample parsed;
    parsed.sampleId = stringValue(member(sample, "sampleId", label), label + ".sampleId");
    parsed.edgeId = stringValue(member(sample, "edgeId", label), label + ".edgeId");
    if (!sampleIds.insert(parsed.sampleId).second) {
      throw std::runtime_error("duplicate sample identity: " + parsed.sampleId);
    }
    const auto& position = objectValue(member(sample, "position", label), label + ".position");
    const float radius = checkedFloat(member(sample, "radius", label), label + ".radius");
    if (!(radius > 0.0f)) throw std::runtime_error(label + ".radius must be positive");
    parsed.value = {
        checkedFloat(member(position, "x", label + ".position"), label + ".position.x"),
        checkedFloat(member(position, "y", label + ".position"), label + ".position.y"),
        checkedFloat(member(position, "z", label + ".position"), label + ".position.z"),
        radius,
    };
    request.samples.push_back(std::move(parsed));
  }
  return request;
}

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

class CudaDriver {
 public:
  CudaDriver() {
    library_ = LoadLibraryExW(L"nvcuda.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!library_) throw std::runtime_error("nvcuda.dll is unavailable in System32");
    cuInit_ = symbol<Init>("cuInit");
    cuDeviceGetCount_ = symbol<DeviceGetCount>("cuDeviceGetCount");
    cuDeviceGet_ = symbol<DeviceGet>("cuDeviceGet");
    cuDeviceGetName_ = symbol<DeviceGetName>("cuDeviceGetName");
    cuDeviceComputeCapability_ = symbol<DeviceComputeCapability>("cuDeviceComputeCapability");
    cuDriverGetVersion_ = symbol<DriverGetVersion>("cuDriverGetVersion");
    cuGetErrorName_ = optionalSymbol<GetErrorName>("cuGetErrorName");
    cuGetErrorString_ = optionalSymbol<GetErrorString>("cuGetErrorString");
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
    cuCtxSynchronize_ = symbol<CtxSynchronize>("cuCtxSynchronize");
    cuEventCreate_ = symbol<EventCreate>("cuEventCreate");
    cuEventRecord_ = symbol<EventRecord>("cuEventRecord");
    cuEventSynchronize_ = symbol<EventSynchronize>("cuEventSynchronize");
    cuEventElapsedTime_ = symbol<EventElapsedTime>("cuEventElapsedTime");
    cuEventDestroy_ = symbolAny<EventDestroy>({"cuEventDestroy_v2", "cuEventDestroy"});
  }

  CudaDriver(const CudaDriver&) = delete;
  CudaDriver& operator=(const CudaDriver&) = delete;

  ~CudaDriver() {
    if (startEvent_) cuEventDestroy_(startEvent_);
    if (stopEvent_) cuEventDestroy_(stopEvent_);
    if (ballsDevice_) cuMemFree_(ballsDevice_);
    if (samplesDevice_) cuMemFree_(samplesDevice_);
    if (outputsDevice_) cuMemFree_(outputsDevice_);
    if (module_) cuModuleUnload_(module_);
    if (context_) cuCtxDestroy_(context_);
    if (library_) FreeLibrary(library_);
  }

  void initialize() {
    check(cuInit_(0), "cuInit");
    int count = 0;
    check(cuDeviceGetCount_(&count), "cuDeviceGetCount");
    if (count < 1) throw std::runtime_error("CUDA driver reports no devices");
    check(cuDeviceGet_(&device_, 0), "cuDeviceGet");
    char name[256]{};
    check(cuDeviceGetName_(name, static_cast<int>(sizeof(name)), device_), "cuDeviceGetName");
    deviceName_ = name;
    check(cuDeviceComputeCapability_(&computeMajor_, &computeMinor_, device_), "cuDeviceComputeCapability");
    check(cuDriverGetVersion_(&driverVersion_), "cuDriverGetVersion");
  }

  const std::string& deviceName() const { return deviceName_; }
  int computeMajor() const { return computeMajor_; }
  int computeMinor() const { return computeMinor_; }
  int driverVersion() const { return driverVersion_; }
  double initializationMilliseconds() const { return initializationMilliseconds_; }

  void prepare() {
    if (context_) return;
    const auto start = std::chrono::steady_clock::now();
    check(cuCtxCreate_(&context_, 0, device_), "cuCtxCreate");
    check(cuModuleLoadDataEx_(&module_, kKatachiContainmentPtx, 0, nullptr, nullptr), "cuModuleLoadDataEx(embedded PTX)");
    check(cuModuleGetFunction_(&kernel_, module_, "evaluate_containment_kernel"), "cuModuleGetFunction");
    check(cuEventCreate_(&startEvent_, 0), "cuEventCreate(start)");
    check(cuEventCreate_(&stopEvent_, 0), "cuEventCreate(stop)");
    initializationMilliseconds_ = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - start).count();
  }

  struct Timing {
    double setupMilliseconds = 0.0;
    double contextInitializationMilliseconds = 0.0;
    double bufferPreparationMilliseconds = 0.0;
    double hostToDeviceMilliseconds = 0.0;
    double kernelTotalMilliseconds = 0.0;
    double kernelAverageMilliseconds = 0.0;
    double deviceToHostMilliseconds = 0.0;
    double endToEndMilliseconds = 0.0;
    unsigned iterations = 1;
    bool contextReused = false;
    bool moduleReused = false;
    bool functionReused = false;
    bool ballBufferReused = false;
    bool sampleBufferReused = false;
    bool outputBufferReused = false;
    std::size_t ballBufferCapacityBytes = 0;
    std::size_t sampleBufferCapacityBytes = 0;
    std::size_t outputBufferCapacityBytes = 0;
  };

  std::pair<std::vector<KernelOutput>, Timing> evaluate(const Request& request) {
    const auto totalStart = std::chrono::steady_clock::now();
    Timing timing;
    timing.iterations = request.benchmarkIterations;
    timing.contextReused = context_ != nullptr;
    timing.moduleReused = module_ != nullptr;
    timing.functionReused = kernel_ != nullptr;
    const auto contextStart = std::chrono::steady_clock::now();
    prepare();
    timing.contextInitializationMilliseconds = timing.contextReused
        ? 0.0
        : std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - contextStart).count();

    std::vector<Float4> sampleValues;
    sampleValues.reserve(request.samples.size());
    for (const auto& sample : request.samples) sampleValues.push_back(sample.value);
    std::vector<KernelOutput> outputs(request.samples.size());
    const std::size_t ballsBytes = request.balls.size() * sizeof(Float4);
    const std::size_t samplesBytes = sampleValues.size() * sizeof(Float4);
    const std::size_t outputsBytes = outputs.size() * sizeof(KernelOutput);
    const auto bufferStart = std::chrono::steady_clock::now();
    timing.ballBufferReused = ensureBuffer(ballsDevice_, ballsCapacityBytes_, ballsBytes, "cuMemAlloc(balls)");
    if (samplesBytes > 0) {
      timing.sampleBufferReused = ensureBuffer(
          samplesDevice_, samplesCapacityBytes_, samplesBytes, "cuMemAlloc(samples)");
      timing.outputBufferReused = ensureBuffer(
          outputsDevice_, outputsCapacityBytes_, outputsBytes, "cuMemAlloc(outputs)");
    }
    timing.bufferPreparationMilliseconds = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - bufferStart).count();
    timing.ballBufferCapacityBytes = ballsCapacityBytes_;
    timing.sampleBufferCapacityBytes = samplesCapacityBytes_;
    timing.outputBufferCapacityBytes = outputsCapacityBytes_;

    const bool ballContentReused = timing.ballBufferReused
        && lastBalls_.size() == request.balls.size()
        && std::memcmp(lastBalls_.data(), request.balls.data(), ballsBytes) == 0;
    timing.ballBufferReused = ballContentReused;
    const auto hostToDeviceStart = std::chrono::steady_clock::now();
    if (!ballContentReused) {
      check(cuMemcpyHtoD_(ballsDevice_, request.balls.data(), ballsBytes), "cuMemcpyHtoD(balls)");
      lastBalls_ = request.balls;
    }
    if (samplesBytes > 0) {
      check(cuMemcpyHtoD_(samplesDevice_, sampleValues.data(), samplesBytes), "cuMemcpyHtoD(samples)");
    }
    timing.hostToDeviceMilliseconds = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - hostToDeviceStart).count();
    timing.setupMilliseconds = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - totalStart).count();

    if (!sampleValues.empty()) {
      unsigned ballCount = static_cast<unsigned>(request.balls.size());
      float smoothness = request.smoothness;
      unsigned sampleCount = static_cast<unsigned>(request.samples.size());
      float boundaryTolerance = request.boundaryTolerance;
      void* parameters[] = {
          &ballsDevice_, &ballCount, &smoothness, &samplesDevice_,
          &outputsDevice_, &sampleCount, &boundaryTolerance,
      };
      constexpr unsigned blockSize = 256;
      const unsigned gridSize = (sampleCount + blockSize - 1) / blockSize;
      check(cuEventRecord_(startEvent_, nullptr), "cuEventRecord(start)");
      for (unsigned iteration = 0; iteration < request.benchmarkIterations; ++iteration) {
        check(cuLaunchKernel_(
            kernel_, gridSize, 1, 1, blockSize, 1, 1, 0, nullptr, parameters, nullptr),
            "cuLaunchKernel");
      }
      check(cuEventRecord_(stopEvent_, nullptr), "cuEventRecord(stop)");
      check(cuEventSynchronize_(stopEvent_), "cuEventSynchronize(stop)");
      float kernelMilliseconds = 0.0f;
      check(cuEventElapsedTime_(&kernelMilliseconds, startEvent_, stopEvent_), "cuEventElapsedTime");
      timing.kernelTotalMilliseconds = kernelMilliseconds;
      timing.kernelAverageMilliseconds = kernelMilliseconds / request.benchmarkIterations;
      const auto deviceToHostStart = std::chrono::steady_clock::now();
      check(cuMemcpyDtoH_(outputs.data(), outputsDevice_, outputsBytes), "cuMemcpyDtoH(outputs)");
      check(cuCtxSynchronize_(), "cuCtxSynchronize");
      timing.deviceToHostMilliseconds = std::chrono::duration<double, std::milli>(
          std::chrono::steady_clock::now() - deviceToHostStart).count();
    }
    const auto totalEnd = std::chrono::steady_clock::now();
    timing.endToEndMilliseconds = std::chrono::duration<double, std::milli>(totalEnd - totalStart).count();
    return {std::move(outputs), timing};
  }

 private:
  using Init = CUresult(WINAPI*)(unsigned);
  using DeviceGetCount = CUresult(WINAPI*)(int*);
  using DeviceGet = CUresult(WINAPI*)(CUdevice*, int);
  using DeviceGetName = CUresult(WINAPI*)(char*, int, CUdevice);
  using DeviceComputeCapability = CUresult(WINAPI*)(int*, int*, CUdevice);
  using DriverGetVersion = CUresult(WINAPI*)(int*);
  using GetErrorName = CUresult(WINAPI*)(CUresult, const char**);
  using GetErrorString = CUresult(WINAPI*)(CUresult, const char**);
  using CtxCreate = CUresult(WINAPI*)(CUcontext*, unsigned, CUdevice);
  using CtxDestroy = CUresult(WINAPI*)(CUcontext);
  using ModuleLoadDataEx = CUresult(WINAPI*)(CUmodule*, const void*, unsigned, int*, void**);
  using ModuleUnload = CUresult(WINAPI*)(CUmodule);
  using ModuleGetFunction = CUresult(WINAPI*)(CUfunction*, CUmodule, const char*);
  using MemAlloc = CUresult(WINAPI*)(CUdeviceptr*, std::size_t);
  using MemFree = CUresult(WINAPI*)(CUdeviceptr);
  using MemcpyHtoD = CUresult(WINAPI*)(CUdeviceptr, const void*, std::size_t);
  using MemcpyDtoH = CUresult(WINAPI*)(void*, CUdeviceptr, std::size_t);
  using LaunchKernel = CUresult(WINAPI*)(
      CUfunction, unsigned, unsigned, unsigned, unsigned, unsigned, unsigned,
      unsigned, CUstream, void**, void**);
  using CtxSynchronize = CUresult(WINAPI*)();
  using EventCreate = CUresult(WINAPI*)(CUevent*, unsigned);
  using EventRecord = CUresult(WINAPI*)(CUevent, CUstream);
  using EventSynchronize = CUresult(WINAPI*)(CUevent);
  using EventElapsedTime = CUresult(WINAPI*)(float*, CUevent, CUevent);
  using EventDestroy = CUresult(WINAPI*)(CUevent);

  template <typename T>
  T optionalSymbol(const char* name) {
    return reinterpret_cast<T>(GetProcAddress(library_, name));
  }

  template <typename T>
  T symbol(const char* name) {
    T result = optionalSymbol<T>(name);
    if (!result) throw std::runtime_error(std::string("nvcuda.dll is missing symbol ") + name);
    return result;
  }

  template <typename T>
  T symbolAny(std::initializer_list<const char*> names) {
    for (const char* name : names) {
      if (T result = optionalSymbol<T>(name)) return result;
    }
    throw std::runtime_error("nvcuda.dll is missing a required versioned symbol");
  }

  void check(CUresult result, std::string_view operation) const {
    if (result == 0) return;
    const char* name = nullptr;
    const char* detail = nullptr;
    if (cuGetErrorName_) cuGetErrorName_(result, &name);
    if (cuGetErrorString_) cuGetErrorString_(result, &detail);
    std::ostringstream message;
    message << operation << " failed with CUDA error " << result;
    if (name) message << " (" << name << ')';
    if (detail) message << ": " << detail;
    throw std::runtime_error(message.str());
  }

  bool ensureBuffer(
      CUdeviceptr& buffer,
      std::size_t& capacityBytes,
      std::size_t requiredBytes,
      std::string_view operation) {
    if (requiredBytes <= capacityBytes && buffer != 0) return true;
    if (buffer) {
      check(cuMemFree_(buffer), "cuMemFree(grow buffer)");
      buffer = 0;
      capacityBytes = 0;
    }
    std::size_t newCapacity = 256;
    while (newCapacity < requiredBytes) newCapacity *= 2;
    check(cuMemAlloc_(&buffer, newCapacity), operation);
    capacityBytes = newCapacity;
    return false;
  }

  HMODULE library_ = nullptr;
  Init cuInit_ = nullptr;
  DeviceGetCount cuDeviceGetCount_ = nullptr;
  DeviceGet cuDeviceGet_ = nullptr;
  DeviceGetName cuDeviceGetName_ = nullptr;
  DeviceComputeCapability cuDeviceComputeCapability_ = nullptr;
  DriverGetVersion cuDriverGetVersion_ = nullptr;
  GetErrorName cuGetErrorName_ = nullptr;
  GetErrorString cuGetErrorString_ = nullptr;
  CtxCreate cuCtxCreate_ = nullptr;
  CtxDestroy cuCtxDestroy_ = nullptr;
  ModuleLoadDataEx cuModuleLoadDataEx_ = nullptr;
  ModuleUnload cuModuleUnload_ = nullptr;
  ModuleGetFunction cuModuleGetFunction_ = nullptr;
  MemAlloc cuMemAlloc_ = nullptr;
  MemFree cuMemFree_ = nullptr;
  MemcpyHtoD cuMemcpyHtoD_ = nullptr;
  MemcpyDtoH cuMemcpyDtoH_ = nullptr;
  LaunchKernel cuLaunchKernel_ = nullptr;
  CtxSynchronize cuCtxSynchronize_ = nullptr;
  EventCreate cuEventCreate_ = nullptr;
  EventRecord cuEventRecord_ = nullptr;
  EventSynchronize cuEventSynchronize_ = nullptr;
  EventElapsedTime cuEventElapsedTime_ = nullptr;
  EventDestroy cuEventDestroy_ = nullptr;

  CUdevice device_ = 0;
  CUcontext context_ = nullptr;
  CUmodule module_ = nullptr;
  CUfunction kernel_ = nullptr;
  CUdeviceptr ballsDevice_ = 0;
  CUdeviceptr samplesDevice_ = 0;
  CUdeviceptr outputsDevice_ = 0;
  CUevent startEvent_ = nullptr;
  CUevent stopEvent_ = nullptr;
  std::size_t ballsCapacityBytes_ = 0;
  std::size_t samplesCapacityBytes_ = 0;
  std::size_t outputsCapacityBytes_ = 0;
  std::vector<Float4> lastBalls_;
  std::string deviceName_;
  double initializationMilliseconds_ = 0.0;
  int computeMajor_ = 0;
  int computeMinor_ = 0;
  int driverVersion_ = 0;
};

json::Object deviceDocument(const CudaDriver& cuda) {
  return {
      {"computeCapability", std::to_string(cuda.computeMajor()) + "." + std::to_string(cuda.computeMinor())},
      {"driverApiVersion", cuda.driverVersion()},
      {"name", cuda.deviceName()},
  };
}

json::Value capabilitiesDocument(const CudaDriver& cuda) {
  json::Array algorithms;
  algorithms.emplace_back(kAlgorithmContract);
  json::Array workerTransports;
  workerTransports.emplace_back("length-framed-json-v1");
  return json::Object{
      {"algorithmContracts", std::move(algorithms)},
      {"contract", kExecutableCapabilitiesContract},
      {"device", deviceDocument(cuda)},
      {"engineVersion", kEngineVersion},
      {"executableProtocol", 1},
      {"kernelSource", "embedded-ptx-driver-jit"},
      {"precisionMode", "float32"},
      {"shadow", true},
      {"productionApplied", false},
      {"workerTransports", std::move(workerTransports)},
  };
}

const char* classificationName(std::uint32_t classification) {
  switch (classification) {
    case 0: return "inside";
    case 1: return "boundary";
    case 2: return "outside";
    default: throw std::runtime_error("CUDA kernel returned an invalid classification code");
  }
}

json::Value resultDocument(
    const Request& request,
    const std::vector<KernelOutput>& outputs,
    const CudaDriver::Timing& timing,
    const CudaDriver& cuda) {
  if (outputs.size() != request.samples.size()) throw std::runtime_error("internal sample count mismatch");
  json::Array samples;
  json::Array outsideSampleIds;
  json::Array outsideEdgeIds;
  std::set<std::string> seenOutsideEdges;
  double maximumExcess = outputs.empty() ? 0.0 : -std::numeric_limits<double>::infinity();
  double minimumClearance = outputs.empty() ? 0.0 : std::numeric_limits<double>::infinity();
  for (std::size_t i = 0; i < outputs.size(); ++i) {
    const auto& result = outputs[i];
    if (!std::isfinite(result.baseSignedDistance)
        || !std::isfinite(result.radiusAdjustedMargin)
        || !std::isfinite(result.radiusClearance)) {
      throw std::runtime_error("CUDA kernel produced a non-finite value for sample " + request.samples[i].sampleId);
    }
    const char* classification = classificationName(result.classification);
    if (result.classification == 2) {
      outsideSampleIds.emplace_back(request.samples[i].sampleId);
      if (seenOutsideEdges.insert(request.samples[i].edgeId).second) {
        outsideEdgeIds.emplace_back(request.samples[i].edgeId);
      }
    }
    maximumExcess = std::max(maximumExcess, static_cast<double>(result.radiusAdjustedMargin));
    minimumClearance = std::min(minimumClearance, static_cast<double>(result.radiusClearance));
    samples.emplace_back(json::Object{
        {"baseSignedDistance", static_cast<double>(result.baseSignedDistance)},
        {"classification", classification},
        {"edgeId", request.samples[i].edgeId},
        {"radiusAdjustedMargin", static_cast<double>(result.radiusAdjustedMargin)},
        {"radiusClearance", static_cast<double>(result.radiusClearance)},
        {"sampleId", request.samples[i].sampleId},
    });
  }

  json::Object timingDocument{
      {"ballBufferCapacityBytes", static_cast<double>(timing.ballBufferCapacityBytes)},
      {"ballBufferReused", timing.ballBufferReused},
      {"bufferPreparationMilliseconds", timing.bufferPreparationMilliseconds},
      {"contextInitializationMilliseconds", timing.contextInitializationMilliseconds},
      {"contextReused", timing.contextReused},
      {"deviceToHostMilliseconds", timing.deviceToHostMilliseconds},
      {"endToEndMilliseconds", timing.endToEndMilliseconds},
      {"functionReused", timing.functionReused},
      {"hostToDeviceMilliseconds", timing.hostToDeviceMilliseconds},
      {"iterations", timing.iterations},
      {"kernelAverageMilliseconds", timing.kernelAverageMilliseconds},
      {"kernelTotalMilliseconds", timing.kernelTotalMilliseconds},
      {"moduleReused", timing.moduleReused},
      {"outputBufferCapacityBytes", static_cast<double>(timing.outputBufferCapacityBytes)},
      {"outputBufferReused", timing.outputBufferReused},
      {"sampleBufferCapacityBytes", static_cast<double>(timing.sampleBufferCapacityBytes)},
      {"sampleBufferReused", timing.sampleBufferReused},
      {"setupMilliseconds", timing.setupMilliseconds},
  };
  json::Object backend{
      {"backendId", "windows-cuda-containment-v1"},
      {"backendKind", "cuda"},
      {"deviceName", cuda.deviceName()},
      {"engineVersion", kEngineVersion},
      {"precisionMode", "float32"},
  };
  return json::Object{
      {"algorithmContract", request.algorithmContract},
      {"backend", std::move(backend)},
      {"clientRequestId", request.clientRequestId},
      {"contract", kExecutableResultContract},
      {"device", deviceDocument(cuda)},
      {"productionApplied", false},
      {"projectFingerprint", request.projectFingerprint},
      {"samples", std::move(samples)},
      {"shadow", true},
      {"summary", json::Object{
          {"checkedSampleCount", static_cast<double>(outputs.size())},
          {"contained", outsideSampleIds.empty()},
          {"maximumExcess", maximumExcess},
          {"maximumExcessMm", maximumExcess / request.unitsPerMillimeter},
          {"minimumClearance", minimumClearance},
          {"outsideEdgeIds", std::move(outsideEdgeIds)},
          {"outsideSampleIds", std::move(outsideSampleIds)},
      }},
      {"timing", timingDocument},
      {"timingMilliseconds", timing.endToEndMilliseconds},
  };
}

struct Frame {
  std::uint16_t kind = 0;
  std::string payload;
};

bool readFrame(Frame& frame) {
  char header[16]{};
  std::cin.read(header, static_cast<std::streamsize>(sizeof(header)));
  const std::streamsize headerBytes = std::cin.gcount();
  if (headerBytes == 0 && std::cin.eof()) return false;
  if (headerBytes != static_cast<std::streamsize>(sizeof(header))) {
    throw std::runtime_error("worker received a truncated frame header");
  }
  if (header[0] != 'K' || header[1] != 'C' || header[2] != 'F' || header[3] != '1') {
    throw std::runtime_error("worker received invalid frame magic");
  }
  const auto byte = [&header](std::size_t index) {
    return static_cast<std::uint64_t>(static_cast<unsigned char>(header[index]));
  };
  const std::uint16_t version = static_cast<std::uint16_t>(byte(4) | (byte(5) << 8));
  if (version != kFrameProtocolVersion) throw std::runtime_error("unsupported worker frame version");
  frame.kind = static_cast<std::uint16_t>(byte(6) | (byte(7) << 8));
  std::uint64_t payloadBytes = 0;
  for (std::size_t index = 0; index < 8; ++index) payloadBytes |= byte(8 + index) << (index * 8);
  if (payloadBytes > kMaximumFrameBytes) throw std::runtime_error("worker frame exceeds the fixed size limit");
  frame.payload.resize(static_cast<std::size_t>(payloadBytes));
  if (payloadBytes > 0) {
    std::cin.read(frame.payload.data(), static_cast<std::streamsize>(payloadBytes));
    if (std::cin.gcount() != static_cast<std::streamsize>(payloadBytes)) {
      throw std::runtime_error("worker received a truncated frame payload");
    }
  }
  return true;
}

void writeFrame(std::uint16_t kind, std::string_view payload) {
  if (payload.size() > kMaximumFrameBytes) throw std::runtime_error("worker response exceeds the fixed size limit");
  char header[16]{'K', 'C', 'F', '1'};
  header[4] = static_cast<char>(kFrameProtocolVersion & 0xff);
  header[5] = static_cast<char>((kFrameProtocolVersion >> 8) & 0xff);
  header[6] = static_cast<char>(kind & 0xff);
  header[7] = static_cast<char>((kind >> 8) & 0xff);
  const std::uint64_t payloadBytes = payload.size();
  for (std::size_t index = 0; index < 8; ++index) {
    header[8 + index] = static_cast<char>((payloadBytes >> (index * 8)) & 0xff);
  }
  std::cout.write(header, static_cast<std::streamsize>(sizeof(header)));
  std::cout.write(payload.data(), static_cast<std::streamsize>(payload.size()));
  std::cout.flush();
  if (!std::cout) throw std::runtime_error("worker failed to write a response frame");
}

int runFramedJsonWorker(CudaDriver& cuda) {
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
  cuda.prepare();
  const std::string ready = json::stringify(json::Object{
      {"capabilities", capabilitiesDocument(cuda)},
      {"contract", "katachi.cuda-persistent-worker-ready.v1"},
      {"initializationMilliseconds", cuda.initializationMilliseconds()},
      {"productionApplied", false},
      {"shadow", true},
      {"transport", "length-framed-json-v1"},
  });
  writeFrame(kFrameReady, ready);
  Frame frame;
  while (readFrame(frame)) {
    try {
      if (frame.kind != kFrameJsonRequest) throw std::runtime_error("worker expected a framed JSON request");
      const Request request = validateRequest(json::Parser(frame.payload).parse());
      auto [outputs, timing] = cuda.evaluate(request);
      writeFrame(kFrameJsonResponse, json::stringify(resultDocument(request, outputs, timing, cuda)));
    } catch (const std::exception& error) {
      writeFrame(kFrameError, json::stringify(json::Object{
          {"code", "cuda_worker_request_failed"},
          {"detail", error.what()},
          {"productionApplied", false},
          {"shadow", true},
      }));
      return 2;
    }
  }
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  try {
    if (argc != 2) {
      throw std::runtime_error("usage: katachi-containment-cuda.exe --capabilities-json | --evaluate-containment-json | --worker-framed-json");
    }
    CudaDriver cuda;
    cuda.initialize();
    const std::string_view mode(argv[1]);
    if (mode == "--capabilities-json") {
      std::cout << json::stringify(capabilitiesDocument(cuda)) << '\n';
      return 0;
    }
    if (mode == "--worker-framed-json") return runFramedJsonWorker(cuda);
    if (mode != "--evaluate-containment-json") {
      throw std::runtime_error("unsupported command-line mode");
    }
    std::ostringstream input;
    input << std::cin.rdbuf();
    const json::Value parsed = json::Parser(input.str()).parse();
    const Request request = validateRequest(parsed);
    auto [outputs, timing] = cuda.evaluate(request);
    std::cout << json::stringify(resultDocument(request, outputs, timing, cuda)) << '\n';
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "katachi-containment-cuda: " << error.what() << '\n';
    return 1;
  }
}
