#include "network.hpp"
#include "geometry.hpp"
#include <algorithm>
#include <cmath>
#include <random>
#include <stdexcept>

namespace iot {
using Json = nlohmann::json;
double estimated_rssi(double units, double wall_loss, const SimulationConfig& c) {
    const double metres = units * c.metres_per_unit;
    if (!std::isfinite(metres)) throw std::invalid_argument("Physical distance exceeds finite range");
    return c.transmit_power_dbm - c.reference_loss_db -
        10 * c.path_loss_exponent * std::log10(std::max(1.0, metres)) - wall_loss;
}
Json evaluate_network(const SimulationInput& in, Json response) {
    if (!in.simulation.enabled) return response;
    const auto& c = in.simulation;
    auto& links = response["geometry"]["links"];
    for (std::size_t i = 0; i < links.size(); ++i) {
        auto& link = links[i];
        const auto& gateway = in.gateways[i % in.gateways.size()];
        const double rssi = estimated_rssi(link["distance"], link["wall_attenuation_db"], c);
        link["distance_metres"] = link["distance"].get<double>() * c.metres_per_unit;
        link["rssi_dbm"] = rssi;
        link["gateway_active"] = gateway.active;
        link["reachable"] = gateway.active && rssi >= c.sensitivity_dbm;
    }
    Json devices = Json::array();
    int reachable_count = 0;
    long long total_sent = 0, total_delivered = 0;
    double total_latency = 0, worst_latency = 0;
    bool all_have_delivery = !in.devices.empty();
    for (std::size_t index = 0; index < in.devices.size(); ++index) {
        const auto& device = in.devices[index];
        const Json* best = nullptr;
        for (const auto& link : links) {
            if (link["source"] == device.id && link["reachable"].get<bool>() &&
                (!best || link["rssi_dbm"].get<double>() > (*best)["rssi_dbm"].get<double>())) best = &link;
        }
        // Independent deterministic stream per device; fixed seed is reproducible.
        std::mt19937 rng(c.seed + static_cast<unsigned int>(index) * 2654435761U);
        int delivered = 0;
        double latency_sum = 0, latency_max = 0;
        const double probability = best ? 1.0 / (1.0 + std::exp(-((*best)["rssi_dbm"].get<double>() - c.sensitivity_dbm - 5) / 2.5)) : 0;
        if (best) {
            ++reachable_count;
            for (int packet = 0; packet < c.packets_per_device; ++packet) {
                for (int attempt = 0; attempt <= c.retries; ++attempt) {
                    const double sample = static_cast<double>(rng()) / 4294967296.0;
                    if (sample < probability) {
                        const double latency = (attempt + 1) * c.packet_airtime_ms +
                                               attempt * c.retry_delay_ms + c.backhaul_latency_ms;
                        ++delivered; latency_sum += latency;
                        latency_max = std::max(latency_max, latency);
                        break;
                    }
                }
            }
        }
        if (delivered == 0) all_have_delivery = false;
        total_sent += c.packets_per_device; total_delivered += delivered;
        total_latency += latency_sum; worst_latency = std::max(worst_latency, latency_max);
        devices.push_back({{"device_id", device.id}, {"gateway_id", best ? (*best)["destination"] : Json(nullptr)},
            {"reachable", best != nullptr}, {"rssi_dbm", best ? (*best)["rssi_dbm"] : Json(nullptr)},
            {"generated_messages", c.packets_per_device}, {"delivered_messages", delivered},
            {"lost_messages", c.packets_per_device - delivered},
            {"reliability", static_cast<double>(delivered) / c.packets_per_device},
            {"average_latency_ms", delivered ? Json(latency_sum / delivered) : Json(nullptr)},
            {"worst_latency_ms", delivered ? Json(latency_max) : Json(nullptr)}});
    }
    const double coverage = in.devices.empty() ? 0 : static_cast<double>(reachable_count) / in.devices.size();
    const double reliability = total_sent ? static_cast<double>(total_delivered) / total_sent : 0;
    bool monitoring = true;
    Json diagnostics = Json::array();
    for (const auto& room : in.rooms) {
        if (room.type != RoomType::Room && room.type != RoomType::Bathroom) continue;
        const DeviceType required = room.type == RoomType::Room ? DeviceType::TemperatureSensor : DeviceType::LeakSensor;
        const bool present = std::any_of(in.devices.begin(), in.devices.end(), [&](const Device& device) {
            return device.room_id == room.id && device.type == required && point_inside_room({device.x, device.y}, room);
        });
        if (!present) { monitoring = false; diagnostics.push_back("Missing correctly placed sensor in " + room.id); }
    }
    const bool coverage_ok = !in.devices.empty() && coverage >= in.requirements.coverage_required;
    const bool reliability_ok = !in.devices.empty() && reliability >= in.requirements.min_reliability;
    const bool latency_ok = all_have_delivery && worst_latency <= in.requirements.max_latency_ms;
    if (!coverage_ok) diagnostics.push_back("Reachable sensor fraction is below required coverage");
    if (!reliability_ok) diagnostics.push_back("Delivered message fraction is below required reliability");
    if (!latency_ok) diagnostics.push_back("Latency requirement failed or is undefined for a sensor with no deliveries");
    response["summary"] = {{"coverage", coverage}, {"reliability", reliability},
        {"total_devices", in.devices.size()}, {"reachable_devices", reachable_count},
        {"generated_messages", total_sent}, {"delivered_messages", total_delivered},
        {"lost_messages", total_sent - total_delivered},
        {"average_latency_ms", total_delivered ? Json(total_latency / total_delivered) : Json(nullptr)},
        {"worst_latency_ms", all_have_delivery ? Json(worst_latency) : Json(nullptr)}};
    response["devices"] = devices;
    response["requirements_evaluation"] = {{"pass", coverage_ok && reliability_ok && latency_ok && monitoring},
        {"checks", {{"coverage", coverage_ok}, {"reliability", reliability_ok}, {"latency", latency_ok}, {"monitoring", monitoring}}},
        {"diagnostics", diagnostics}};
    response["model"] = {{"name", "log-distance + wall loss + seeded independent packet trials"},
        {"metres_per_unit", c.metres_per_unit}, {"seed", c.seed}, {"sensitivity_dbm", c.sensitivity_dbm},
        {"reception_backhaul", "assumed wired; fixed backhaul_latency_ms"}};
    return response;
}
}
