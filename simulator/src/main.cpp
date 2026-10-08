#include "geometry.hpp"
#include "json_io.hpp"
#include "network.hpp"

#include <fstream>
#include <iostream>
#include <stdexcept>

int main(int argc, char* argv[]) {
    try {
        if (argc > 2) throw std::invalid_argument("Usage: iot_simulator [input.json]");
        std::ifstream file;
        std::istream* input = &std::cin;
        if (argc == 2) {
            file.open(argv[1]);
            if (!file) throw std::invalid_argument("Cannot open input file: " + std::string(argv[1]));
            input = &file;
        }
        const auto request = iot::load_input(*input);
        const auto response = iot::evaluate_network(request, iot::success_response(iot::evaluate_geometry(request)));
        std::cout << response.dump() << '\n';
        return 0;
    } catch (const nlohmann::json::exception& e) {
        std::cerr << "Invalid JSON input: " << e.what() << '\n';
        std::cout << iot::error_response("INVALID_INPUT", e.what()).dump(-1, ' ', false,
            nlohmann::json::error_handler_t::replace) << '\n';
    } catch (const std::invalid_argument& e) {
        std::cerr << e.what() << '\n';
        std::cout << iot::error_response("INVALID_INPUT", e.what()).dump(-1, ' ', false,
            nlohmann::json::error_handler_t::replace) << '\n';
    } catch (const std::exception& e) {
        std::cerr << e.what() << '\n';
        std::cout << iot::error_response("INTERNAL_ERROR", "Unable to process request").dump() << '\n';
    }
    return 1;
}
