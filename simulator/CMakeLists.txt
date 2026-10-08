cmake_minimum_required(VERSION 3.20)
project(iot_simulator VERSION 0.2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Debug CACHE STRING "Build type" FORCE)
endif()
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

include(FetchContent)
if(POLICY CMP0135)
    cmake_policy(SET CMP0135 NEW)
endif()
set(JSON_BuildTests OFF CACHE BOOL "Build JSON dependency tests" FORCE)
FetchContent_Declare(nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz
    URL_HASH SHA256=42f6e95cad6ec532fd372391373363b62a14af6d771056dbfc86160e6dfff7aa
)
FetchContent_MakeAvailable(nlohmann_json)

add_library(simulator_core src/geometry.cpp src/json_io.cpp src/network.cpp)
target_include_directories(simulator_core PUBLIC include)
target_link_libraries(simulator_core PUBLIC nlohmann_json::nlohmann_json)
if(MSVC)
    target_compile_options(simulator_core PRIVATE /W4 /permissive- /utf-8)
endif()
add_executable(iot_simulator src/main.cpp)
target_link_libraries(iot_simulator PRIVATE simulator_core)

include(CTest)
if(BUILD_TESTING)
    add_executable(simulator_tests tests/test_main.cpp)
    add_executable(network_tests tests/test_network.cpp)
    target_link_libraries(network_tests PRIVATE simulator_core)
    add_test(NAME signal_and_packets COMMAND network_tests "${CMAKE_CURRENT_SOURCE_DIR}/../shared/fixtures/basic-hotel.json")
    target_link_libraries(simulator_tests PRIVATE simulator_core)
    add_test(NAME geometry_and_contract COMMAND simulator_tests "${CMAKE_CURRENT_SOURCE_DIR}/tests")
    add_test(NAME cli_contract COMMAND ${CMAKE_COMMAND}
        "-DSIMULATOR=$<TARGET_FILE:iot_simulator>"
        "-DFIXTURES=${CMAKE_CURRENT_SOURCE_DIR}/tests"
        -P "${CMAKE_CURRENT_SOURCE_DIR}/tests/cli_tests.cmake")
endif()
