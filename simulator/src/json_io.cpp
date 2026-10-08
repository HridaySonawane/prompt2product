#include "json_io.hpp"

#include <array>
#include <cmath>
#include <iterator>
#include <stdexcept>
#include <string_view>
#include <unordered_set>
#include <utility>

namespace iot {
namespace {
using Json = nlohmann::json;
using namespace std::literals;
constexpr std::array room_types{std::pair{"room"sv, RoomType::Room},
    std::pair{"lobby"sv, RoomType::Lobby}, std::pair{"bathroom"sv, RoomType::Bathroom},
    std::pair{"reception"sv, RoomType::Reception}};
constexpr std::array device_types{std::pair{"temperature_sensor"sv, DeviceType::TemperatureSensor},
    std::pair{"leak_sensor"sv, DeviceType::LeakSensor}};
constexpr std::array materials{std::pair{"drywall"sv, Material::Drywall},
    std::pair{"wood"sv, Material::Wood}, std::pair{"concrete"sv, Material::Concrete},
    std::pair{"metal"sv, Material::Metal}};
[[noreturn]] void invalid(const std::string& path, const std::string& message) {
    throw std::invalid_argument(path + ": " + message);
}
const Json& field(const Json& object, const char* key, const std::string& path) {
    if (!object.is_object()) invalid(path, "expected an object");
    if (!object.contains(key)) invalid(path + "." + key, "missing required field");
    return object.at(key);
}
std::string string(const Json& object, const char* key, const std::string& path) {
    const auto& value = field(object, key, path);
    if (!value.is_string()) invalid(path + "." + key, "expected a string");
    return value.get<std::string>();
}
std::string id(const Json& object, const char* key, const std::string& path) {
    auto result = string(object, key, path);
    if (result.empty()) invalid(path + "." + key, "ID must not be empty");
    return result;
}
double number(const Json& object, const char* key, const std::string& path) {
    const auto& value = field(object, key, path);
    if (!value.is_number()) invalid(path + "." + key, "expected a finite number");
    const double result = value.get<double>();
    if (!std::isfinite(result)) invalid(path + "." + key, "expected a finite number");
    return result;
}
double positive(const Json& object, const char* key, const std::string& path) {
    const double result = number(object, key, path);
    if (result <= 0) invalid(path + "." + key, "must be positive");
    return result;
}
double fraction(const Json& object, const char* key, const std::string& path) {
    const double result = number(object, key, path);
    if (result < 0 || result > 1) invalid(path + "." + key, "must be in [0, 1]");
    return result;
}
bool boolean(const Json& object, const char* key, const std::string& path) {
    const auto& value = field(object, key, path);
    if (!value.is_boolean()) invalid(path + "." + key, "expected a JSON boolean");
    return value.get<bool>();
}
template<class Table>
auto enumeration(const Json& object, const char* key, const std::string& path, const Table& table) {
    const auto text = string(object, key, path);
    for (const auto& [name, value] : table) if (text == name) return value;
    invalid(path + "." + key, "unsupported value '" + text + "'");
}
template<class Enum, class Table>
std::string enum_string(Enum value, const Table& table) {
    for (const auto& [name, item] : table) if (value == item) return std::string(name);
    throw std::invalid_argument("Cannot serialize unsupported enum value");
}
template<class T, class Parse>
std::vector<T> array(const Json& root, const char* key, Parse parse) {
    const std::string path = std::string("$.") + key;
    const auto& values = field(root, key, "$");
    if (!values.is_array()) invalid(path, "expected an array");
    std::vector<T> result;
    std::unordered_set<std::string> ids;
    for (std::size_t i = 0; i < values.size(); ++i) {
        const auto entry_path = path + "[" + std::to_string(i) + "]";
        auto entry = parse(values[i], entry_path);
        if (!ids.insert(entry.id).second) invalid(entry_path + ".id", "duplicate ID '" + entry.id + "'");
        result.push_back(std::move(entry));
    }
    return result;
}
} // namespace

SimulationInput parse_input(const nlohmann::json& j) {
    SimulationInput input;
    input.schema_version = string(j, "schema_version", "$");
    if (input.schema_version != "1.0") invalid("$.schema_version", "unsupported schema version");
    const auto& floor = field(j, "floor", "$");
    input.floor = {positive(floor, "width", "$.floor"), positive(floor, "height", "$.floor")};
    input.rooms = array<Room>(j, "rooms", [](const Json& r, const std::string& p) {
        Room room{id(r, "id", p), string(r, "name", p), enumeration(r, "type", p, room_types),
            number(r, "x", p), number(r, "y", p), positive(r, "width", p), positive(r, "height", p)};
        if (!std::isfinite(room.x + room.width) || !std::isfinite(room.y + room.height))
            invalid(p, "room bounds exceed finite numeric range");
        return room;
    });
    input.walls = array<Wall>(j, "walls", [](const Json& w, const std::string& p) {
        return Wall{id(w, "id", p), number(w, "x1", p), number(w, "y1", p),
            number(w, "x2", p), number(w, "y2", p), enumeration(w, "material", p, materials)};
    });
    input.devices = array<Device>(j, "devices", [](const Json& d, const std::string& p) {
        return Device{id(d, "id", p), enumeration(d, "type", p, device_types),
            number(d, "x", p), number(d, "y", p), id(d, "room_id", p)};
    });
    input.gateways = array<Gateway>(j, "gateways", [](const Json& g, const std::string& p) {
        return Gateway{id(g, "id", p), number(g, "x", p), number(g, "y", p), boolean(g, "active", p)};
    });
    const auto& reception = field(j, "reception", "$");
    input.reception = {id(reception, "id", "$.reception"), number(reception, "x", "$.reception"),
                       number(reception, "y", "$.reception")};
    const auto& requirements = field(j, "requirements", "$");
    input.requirements = {fraction(requirements, "coverage_required", "$.requirements"),
        number(requirements, "max_latency_ms", "$.requirements"),
        fraction(requirements, "min_reliability", "$.requirements")};
    if (input.requirements.max_latency_ms < 0) invalid("$.requirements.max_latency_ms", "must be non-negative");
    if (j.contains("simulation")) {
        const auto& s = j.at("simulation");
        if (!s.is_object()) invalid("$.simulation", "expected an object");
        auto& config = input.simulation;
        config.enabled = true;
        config.metres_per_unit = positive(s, "metres_per_unit", "$.simulation");
        if (config.metres_per_unit > 1000) invalid("$.simulation.metres_per_unit", "must be at most 1000");
        auto optional_number = [&](const char* key, double& target, double minimum, double maximum) {
            if (!s.contains(key)) return;
            target = number(s, key, "$.simulation");
            if (target < minimum || target > maximum) invalid(std::string("$.simulation.") + key, "out of supported range");
        };
        optional_number("transmit_power_dbm", config.transmit_power_dbm, -100, 100);
        optional_number("reference_loss_db", config.reference_loss_db, 0, 200);
        optional_number("path_loss_exponent", config.path_loss_exponent, 1, 6);
        optional_number("sensitivity_dbm", config.sensitivity_dbm, -150, 0);
        optional_number("packet_airtime_ms", config.packet_airtime_ms, 0.001, 60000);
        optional_number("retry_delay_ms", config.retry_delay_ms, 0, 60000);
        optional_number("backhaul_latency_ms", config.backhaul_latency_ms, 0, 60000);
        auto integer = [&](const char* key, unsigned int minimum, unsigned int maximum, unsigned int fallback) {
            if (!s.contains(key)) return fallback;
            const auto& value = s.at(key);
            if (!value.is_number_integer() || value.get<double>() < minimum || value.get<double>() > maximum)
                invalid(std::string("$.simulation.") + key, "expected an integer in the supported range");
            return value.get<unsigned int>();
        };
        config.seed = integer("seed", 0, 4294967295U, config.seed);
        config.packets_per_device = static_cast<int>(integer("packets_per_device", 1, 10000, 200));
        config.retries = static_cast<int>(integer("retries", 0, 10, 2));
        config.heatmap_columns = static_cast<int>(integer("heatmap_columns", 1, 50, 20));
        config.heatmap_rows = static_cast<int>(integer("heatmap_rows", 1, 50, 12));
    }
    std::unordered_set<std::string> room_ids;
    for (const auto& room : input.rooms) room_ids.insert(room.id);
    for (const auto& device : input.devices)
        if (!room_ids.contains(device.room_id)) invalid("$.devices", "unknown room_id '" + device.room_id + "'");
    if (input.simulation.enabled) {
        const auto inside_floor = [&](double x, double y) {
            return x >= 0 && y >= 0 && x <= input.floor.width && y <= input.floor.height;
        };
        if (input.gateways.size() > 2) invalid("$.gateways", "MVP supports at most two gateways");
        for (const auto& r : input.rooms)
            if (!inside_floor(r.x, r.y) || !inside_floor(r.x + r.width, r.y + r.height))
                invalid("$.rooms", "room must fit inside the floor: " + r.id);
        for (const auto& d : input.devices)
            if (!inside_floor(d.x, d.y)) invalid("$.devices", "device must be inside the floor: " + d.id);
        for (const auto& g : input.gateways)
            if (!inside_floor(g.x, g.y)) invalid("$.gateways", "gateway must be inside the floor: " + g.id);
        for (const auto& w : input.walls)
            if (!inside_floor(w.x1, w.y1) || !inside_floor(w.x2, w.y2)) invalid("$.walls", "wall must be inside the floor: " + w.id);
        if (!inside_floor(input.reception.x, input.reception.y)) invalid("$.reception", "must be inside the floor");
    }
    return input;
}
SimulationInput load_input(std::istream& stream) {
    // Parse the complete stream; trailing JSON or garbage must not be silently ignored.
    const std::string text{std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
    if (stream.bad()) throw std::runtime_error("Failed to read input stream");
    return parse_input(nlohmann::json::parse(text));
}
nlohmann::json serialize_input(const SimulationInput& in) {
    Json j{{"schema_version", in.schema_version}, {"floor", {{"width", in.floor.width}, {"height", in.floor.height}}},
        {"rooms", Json::array()}, {"walls", Json::array()}, {"devices", Json::array()}, {"gateways", Json::array()},
        {"reception", {{"id", in.reception.id}, {"x", in.reception.x}, {"y", in.reception.y}}},
        {"requirements", {{"coverage_required", in.requirements.coverage_required},
            {"max_latency_ms", in.requirements.max_latency_ms}, {"min_reliability", in.requirements.min_reliability}}}};
    for (const auto& r : in.rooms) j["rooms"].push_back({{"id", r.id}, {"name", r.name},
        {"type", enum_string(r.type, room_types)}, {"x", r.x}, {"y", r.y}, {"width", r.width}, {"height", r.height}});
    for (const auto& w : in.walls) j["walls"].push_back({{"id", w.id}, {"x1", w.x1}, {"y1", w.y1},
        {"x2", w.x2}, {"y2", w.y2}, {"material", enum_string(w.material, materials)}});
    for (const auto& d : in.devices) j["devices"].push_back({{"id", d.id},
        {"type", enum_string(d.type, device_types)}, {"x", d.x}, {"y", d.y}, {"room_id", d.room_id}});
    for (const auto& g : in.gateways) j["gateways"].push_back({{"id", g.id}, {"x", g.x}, {"y", g.y}, {"active", g.active}});
    if (in.simulation.enabled) {
        const auto& s = in.simulation;
        j["simulation"] = {{"metres_per_unit", s.metres_per_unit}, {"seed", s.seed},
            {"packets_per_device", s.packets_per_device}, {"transmit_power_dbm", s.transmit_power_dbm},
            {"reference_loss_db", s.reference_loss_db}, {"path_loss_exponent", s.path_loss_exponent},
            {"sensitivity_dbm", s.sensitivity_dbm}, {"retries", s.retries},
            {"packet_airtime_ms", s.packet_airtime_ms}, {"retry_delay_ms", s.retry_delay_ms},
            {"backhaul_latency_ms", s.backhaul_latency_ms},
            {"heatmap_columns", s.heatmap_columns}, {"heatmap_rows", s.heatmap_rows}};
    }
    // Validate model values before exposing them as contract JSON.
    (void)parse_input(j);
    return j;
}
nlohmann::json success_response(const std::vector<GeometryLink>& links) {
    Json values = Json::array();
    for (const auto& link : links) {
        if (!std::isfinite(link.distance) || !std::isfinite(link.wall_attenuation_db))
            throw std::invalid_argument("Cannot serialize non-finite geometry results");
        values.push_back({{"source", link.source}, {"destination", link.destination},
            {"distance", link.distance}, {"walls_crossed", link.walls_crossed},
            {"wall_attenuation_db", link.wall_attenuation_db}});
    }
    return {{"schema_version", "1.0"}, {"status", "ok"}, {"geometry", {{"links", values}}}};
}
nlohmann::json error_response(const std::string& code, const std::string& message) {
    return {{"schema_version", "1.0"}, {"status", "error"}, {"error", {{"code", code}, {"message", message}}}};
}
} // namespace iot
