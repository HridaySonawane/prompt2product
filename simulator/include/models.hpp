#pragma once

#include <cstddef>
#include <string>
#include <vector>

namespace iot {
struct Point { double x; double y; };
enum class RoomType { Room, Lobby, Bathroom, Reception };
enum class Material { Drywall, Wood, Concrete, Metal };
enum class DeviceType { TemperatureSensor, LeakSensor };
struct Floor { double width; double height; };
struct Room {
    std::string id;
    std::string name;
    RoomType type;
    double x; double y; double width; double height;
};
struct Wall {
    std::string id;
    double x1; double y1; double x2; double y2;
    Material material;
};
struct Device {
    std::string id;
    DeviceType type;
    double x; double y;
    std::string room_id;
};
struct Gateway { std::string id; double x; double y; bool active; };
struct Reception { std::string id; double x; double y; };
struct Requirements {
    double coverage_required;
    double max_latency_ms;
    double min_reliability;
};
struct SimulationConfig {
    bool enabled = false;
    double metres_per_unit = 0.05;
    unsigned int seed = 1337;
    int packets_per_device = 200;
    double transmit_power_dbm = 14;
    double reference_loss_db = 40;
    double path_loss_exponent = 3;
    double sensitivity_dbm = -72;
    int retries = 2;
    double packet_airtime_ms = 30;
    double retry_delay_ms = 100;
    double backhaul_latency_ms = 20;
    int heatmap_columns = 20;
    int heatmap_rows = 12;
};
struct SimulationInput {
    std::string schema_version;
    Floor floor;
    std::vector<Room> rooms;
    std::vector<Wall> walls;
    std::vector<Device> devices;
    std::vector<Gateway> gateways;
    Reception reception;
    Requirements requirements;
    SimulationConfig simulation;
};
struct GeometryLink {
    std::string source;
    std::string destination;
    double distance;
    std::size_t walls_crossed;
    double wall_attenuation_db;
};
// Configurable assumptions, in dB; these are not universal measurements.
struct AttenuationAssumptions {
    double drywall = 3.0;
    double wood = 5.0;
    double concrete = 12.0;
    double metal = 20.0;
};
} // namespace iot
