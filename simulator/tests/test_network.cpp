#include "network.hpp"
#include "json_io.hpp"
#include "geometry.hpp"
#include <cmath>
#include <fstream>
#include <iostream>
#include <stdexcept>

int main(int argc, char** argv) {
    using namespace iot;
    int checks = 0;
    auto check = [&](bool condition, const char* message) {
        ++checks;
        if (!condition) throw std::runtime_error(message);
    };
    try {
        if (argc != 2) throw std::runtime_error("Expected fixture path");
        std::ifstream file(argv[1]);
        nlohmann::json fixture; file >> fixture;
        fixture["simulation"] = {{"metres_per_unit", 0.05}, {"seed", 1337}};
        auto input = parse_input(fixture);
        auto run = [&] { return evaluate_network(input, success_response(evaluate_geometry(input))); };
        check(std::abs(estimated_rssi(20, 0, input.simulation) + 26) < 1e-9, "RSSI at 1 metre");
        check(std::abs(estimated_rssi(200, 0, input.simulation) + 56) < 1e-9, "RSSI at 10 metres");
        check(std::abs(estimated_rssi(200, 12, input.simulation) + 68) < 1e-9, "Concrete wall loss");
        auto result = run();
        check(result == run(), "Fixed-seed output is reproducible");
        check(result["heatmap"]["cells"].size() == 240, "Default heatmap dimensions");
        check(result["summary"]["coverage"] == 1, "Basic coverage");
        check(result["summary"]["generated_messages"] == input.devices.size() * 200, "Packet count");
        check(result["summary"]["delivered_messages"].get<int>() + result["summary"]["lost_messages"].get<int>() == result["summary"]["generated_messages"], "Packet conservation");
        for (auto& gateway : input.gateways) gateway.active = false;
        result = run();
        check(result["summary"]["coverage"] == 0, "Offline gateway cannot carry traffic");
        check(result["summary"]["reliability"] == 0, "Offline delivery reliability");
        check(result["summary"]["worst_latency_ms"].is_null(), "No delivery means undefined latency");
        check(!result["requirements_evaluation"]["pass"].get<bool>(), "Offline requirements fail");
        check(result["heatmap"]["cells"][0]["rssi_dbm"].is_null(), "Offline heatmap signal undefined");
        check(!result["heatmap"]["cells"][0]["reachable"].get<bool>(), "Offline grid unreachable");
        input.gateways.push_back({"backup", input.devices[0].x, input.devices[0].y, true});
        result = run();
        check(result["devices"][0]["gateway_id"] == "backup", "Reassociation to active gateway");
        input.gateways.back().x = 1e6;
        result = run();
        check(result["summary"]["coverage"] == 0, "Distant gateway unreachable");
        input = parse_input(fixture);
        input.simulation.heatmap_columns = 1; input.simulation.heatmap_rows = 1;
        input.walls = {{"grid_wall", 420, 0, 420, 600, Material::Concrete}};
        result = run();
        check(result["heatmap"]["cells"].size() == 1, "Configured grid dimensions");
        const Point sample{input.floor.width / 2, input.floor.height / 2};
        const Point gateway{input.gateways[0].x, input.gateways[0].y};
        const double expected = estimated_rssi(distance(sample, gateway), 12, input.simulation);
        check(std::abs(result["heatmap"]["cells"][0]["rssi_dbm"].get<double>() - expected) < 1e-9, "Grid wall attenuation equals link model");
        input = parse_input(fixture);
        input.simulation.packet_airtime_ms = 3000;
        result = run();
        check(!result["requirements_evaluation"]["checks"]["latency"].get<bool>(), "Latency threshold checked");
        input.devices.clear();
        result = run();
        check(!result["requirements_evaluation"]["checks"]["monitoring"].get<bool>(), "Required room sensors checked");
        check(!result["requirements_evaluation"]["pass"].get<bool>(), "Empty deployment cannot pass");
        input = parse_input(fixture);
        check(serialize_input(input)["simulation"]["metres_per_unit"] == 0.05, "Physical scale roundtrip");
        for (const auto& bad : {nlohmann::json(0), nlohmann::json(-1), nlohmann::json("metres")}) {
            auto invalid = fixture; invalid["simulation"]["metres_per_unit"] = bad;
            bool rejected = false;
            try { parse_input(invalid); } catch (const std::exception&) { rejected = true; }
            check(rejected, "Invalid scale rejected");
        }
        std::cout << checks << " network checks passed\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "Network check failed: " << e.what() << '\n';
        return 1;
    }
}
