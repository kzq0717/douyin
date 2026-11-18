cmake_minimum_required(VERSION 3.21)
project(HongguoTool VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

option(BUILD_DESKTOP_APP "Build Qt6 Windows/Desktop UI target" ON)
option(ENABLE_ONNXRUNTIME "Link ONNX Runtime C++ for CLIP ViT-B/32 local inference" OFF)
option(BUILD_TESTING "Build pure C++17 core unit tests" ON)

# 1. Pure C++17 Core Library (Zero Qt dependencies, independently testable)
add_library(hongguo_core STATIC
    src/core/channel_resolver.cpp
    src/core/metric_calculator.cpp
    src/core/alert_engine.cpp
    src/core/exact_cosine_index.cpp
    src/core/license_validator.cpp
)
target_include_directories(hongguo_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/src")

if(MSVC)
    target_compile_options(hongguo_core PRIVATE /W4 /utf-8)
else()
    target_compile_options(hongguo_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

# 2. Pure C++17 Unit Tests (CTest)
if(BUILD_TESTING)
    enable_testing()
    add_executable(hongguo_core_tests tests/core_tests.cpp)
    target_link_libraries(hongguo_core_tests PRIVATE hongguo_core)
    add_test(NAME HongguoCoreTests COMMAND hongguo_core_tests)
endif()

# 3. Qt 6.5+ Desktop Client
if(BUILD_DESKTOP_APP)
    set(CMAKE_AUTOMOC ON)
    set(CMAKE_AUTORCC ON)
    set(CMAKE_AUTOUIC ON)

    find_package(Qt6 6.5 REQUIRED COMPONENTS Core Gui Widgets Network Sql)

    add_executable(HongguoTool WIN32
        src/main.cpp
        src/infra/oauth_loopback.cpp
        src/infra/sqlite_writer.cpp
        src/infra/onnx_clip_embedder.cpp
        src/infra/doudian_sync_client.cpp
        src/ui/main_window.cpp
    )

    target_link_libraries(HongguoTool PRIVATE
        hongguo_core
        Qt6::Core
        Qt6::Gui
        Qt6::Widgets
        Qt6::Network
        Qt6::Sql
    )

    if(ENABLE_ONNXRUNTIME)
        find_package(ONNXRuntime REQUIRED)
        target_link_libraries(HongguoTool PRIVATE ONNXRuntime::ONNXRuntime)
        target_compile_definitions(HongguoTool PRIVATE HAVE_ONNXRUNTIME=1)
    endif()

    if(MSVC)
        target_compile_options(HongguoTool PRIVATE /W4 /utf-8)
    endif()

    # Copy runtime resources next to output binary
    add_custom_command(TARGET HongguoTool POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CMAKE_CURRENT_SOURCE_DIR}/resources"
        "$<TARGET_FILE_DIR:HongguoTool>/resources"
    )
endif()
