cmake_minimum_required(VERSION 3.24)

project(katachi_cuda_containment_worker VERSION 0.2.0 LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "This bring-up targets the Windows CUDA Driver API.")
endif()

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/src/containment_kernel.ptx" KATACHI_CONTAINMENT_PTX)
configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/src/embedded_ptx.hpp.in"
  "${CMAKE_CURRENT_BINARY_DIR}/generated/embedded_ptx.hpp"
  @ONLY
)

add_executable(katachi-containment-cuda src/main.cpp)
target_compile_features(katachi-containment-cuda PRIVATE cxx_std_20)
target_compile_definitions(katachi-containment-cuda PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
target_include_directories(katachi-containment-cuda PRIVATE "${CMAKE_CURRENT_BINARY_DIR}/generated")

if(MSVC)
  target_compile_options(katachi-containment-cuda PRIVATE /W4 /permissive- /EHsc /O2 /fp:precise)
else()
  message(FATAL_ERROR "This isolated bring-up is verified only with MSVC.")
endif()

set_target_properties(katachi-containment-cuda PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
