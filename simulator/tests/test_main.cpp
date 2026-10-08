#include "geometry.hpp"
#include "json_io.hpp"

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace {
int checks = 0;
void check(bool ok, const std::string& label) {
    ++checks;
    if (!ok) throw std::runtime_error(label);
}
void near(double actual, double expected, const std::string& label) {
    check(std::abs(actual - expected) < 1e-8, label);
}
template<class F> void rejects(F action, const std::string& label) {
    bool rejected = false;
    try { action(); } catch (const std::exception&) { rejected = true; }
    check(rejected, label);
}
} // namespace

int main(int argc, char* argv[]) {
    using namespace iot;
    try {
        if (argc != 2) throw std::runtime_error("Expected fixture directory");
        near(distance({0, 0}, {5, 0}), 5, "horizontal distance");
        near(distance({0, 0}, {0, -7}), 7, "vertical distance");
        near(distance({0, 0}, {3, 4}), 5, "diagonal distance");
        near(distance({3, 4}, {3, 4}), 0, "same position");
        Room room{"r", "R", RoomType::Room, 1, 2, 10, 20};
        check(point_inside_room({5, 5}, room), "inside room");
        check(point_inside_room({1, 2}, room), "lower boundary");
        check(point_inside_room({11, 22}, room), "upper boundary");
        check(!point_inside_room({12, 22}, room), "outside room");
        check(segments_intersect({0, 0}, {4, 0}, {2, -1}, {2, 1}), "crossing");
        check(!segments_intersect({0, 0}, {4, 0}, {5, -1}, {5, 1}), "non intersection");
        check(segments_intersect({0, 0}, {4, 0}, {4, 0}, {4, 1}), "endpoint contact");
        check(segments_intersect({0, 0}, {4, 0}, {2, 0}, {6, 0}), "collinear overlap");
        check(!segments_intersect({0, 0}, {4, 0}, {5, 0}, {6, 0}), "collinear disjoint");
        check(!segments_intersect({0, 0}, {4, 0}, {0, 1}, {4, 1}), "parallel");
        check(segments_intersect({2, 0}, {2, 0}, {0, 0}, {4, 0}), "point on segment");
        check(segments_intersect({2, 0}, {2, 0}, {2, 0}, {2, 0}), "equal point segments");
        check(!segments_intersect({2, 1}, {2, 1}, {0, 0}, {4, 0}), "point off segment");
        check(!segments_intersect({2, 1}, {2, 1}, {2, 2}, {2, 2}), "distinct point segments");
        check(segments_intersect({0, 0}, {4, 0}, {4, 5e-10}, {4, 1}), "within tolerance");
        check(!segments_intersect({0, 0}, {4, 0}, {4, 2e-9}, {4, 1}), "beyond tolerance");
        check(segments_intersect({1e9, 1e9}, {1e9 + 4, 1e9 + 4},
              {1e9, 1e9 + 4}, {1e9 + 4, 1e9}), "translated diagonal crossing");
        check(segments_intersect({1e9, 1e9}, {1e9 + 6, 1e9 + 3},
              {1e9 + 2, 1e9 + 1}, {1e9 + 8, 1e9 + 4}), "translated collinear overlap");
        check(!segments_intersect({1e9, 1e9}, {1e9 + 4, 1e9 + 4},
              {1e9, 1e9 + 1}, {1e9 + 4, 1e9 + 5}), "translated parallel segments");
        Wall wall{"w", 2, -1, 2, 1, Material::Concrete};
        check(crosses_wall({0, 0}, {4, 0}, wall), "proper penetration");
        check(crosses_wall({4, 0}, {0, 0}, wall), "reversed path");
        Wall reversed{"w", 2, 1, 2, -1, Material::Concrete};
        check(crosses_wall({0, 0}, {4, 0}, reversed), "reversed wall");
        check(!crosses_wall({0, 1}, {4, 1}, wall), "wall endpoint excluded");
        check(!crosses_wall({0, 0}, {2, 0}, wall), "path endpoint excluded");
        check(!crosses_wall({2, -2}, {2, 2}, wall), "along wall excluded");
        check(!crosses_wall({2, 0}, {2, 0}, wall), "zero path excluded");
        check(!crosses_wall({0, 0}, {4, 0}, {"p", 2, 0, 2, 0, Material::Wood}), "zero wall excluded");
        check(crosses_wall({0, 0}, {0, 4}, {"h", -1, 2, 1, 2, Material::Wood}), "vertical path");
        near(material_attenuation(Material::Drywall), 3, "drywall");
        near(material_attenuation(Material::Wood), 5, "wood");
        near(material_attenuation(Material::Concrete), 12, "concrete");
        near(material_attenuation(Material::Metal), 20, "metal");
        AttenuationAssumptions custom;
        custom.concrete = 7;
        near(total_wall_attenuation({0, 0}, {4, 0}, {wall}, custom), 7, "configurable assumptions");

        const std::filesystem::path fixtures(argv[1]);
        const char* names[]{"basic", "single_wall", "multiple_walls", "no_intersection", "same_position"};
        const double distances[]{5, 5, 5, 5, 0};
        const std::size_t counts[]{0, 1, 2, 0, 0};
        const double attenuation[]{0, 12, 17, 0, 0};
        nlohmann::json base;
        for (std::size_t i = 0; i < 5; ++i) {
            std::ifstream file(fixtures / (std::string(names[i]) + ".json"));
            check(file.good(), "fixture opens");
            const auto input = load_input(file);
            const auto output = success_response(evaluate_geometry(input));
            check(output.at("status") == "ok", "success status");
            check(output.at("geometry").at("links").size() == 1, "one pair");
            const auto& link = output["geometry"]["links"][0];
            check(link["source"] == "temp_101" && link["destination"] == "gateway_1", "link IDs");
            near(link["distance"], distances[i], "fixture distance");
            check(link["walls_crossed"] == counts[i], "fixture crossing count");
            near(link["wall_attenuation_db"], attenuation[i], "fixture attenuation");
            check(serialize_input(parse_input(serialize_input(input))) == serialize_input(input), "input round trip");
            if (i == 0) base = serialize_input(input);
        }
        auto multi = base;
        multi["devices"].push_back({{"id", "leak_1"}, {"type", "leak_sensor"}, {"x", 0}, {"y", 4}, {"room_id", "room_101"}});
        multi["gateways"].push_back({{"id", "gateway_2"}, {"x", 0}, {"y", 4}, {"active", false}});
        const auto links = evaluate_geometry(parse_input(multi));
        check(links.size() == 4, "all device gateway pairs including inactive gateway");
        near(links[1].distance, 4, "second gateway");
        near(links[2].distance, 3, "second device");
        near(links[3].distance, 0, "second device same position");
        auto empty = base;
        empty["devices"] = nlohmann::json::array();
        check(success_response(evaluate_geometry(parse_input(empty)))["geometry"]["links"].is_array(), "empty links array");
        empty = base;
        empty["gateways"] = nlohmann::json::array();
        check(evaluate_geometry(parse_input(empty)).empty(), "empty gateways");

        for (const auto& key : {"schema_version", "floor", "rooms", "walls", "devices", "gateways", "reception", "requirements"}) {
            auto bad = base; bad.erase(key);
            rejects([&] { (void)parse_input(bad); }, std::string("missing ") + key);
        }
        auto bad_field = [&](const char* pointer, nlohmann::json value) {
            auto bad = base;
            bad[nlohmann::json::json_pointer(pointer)] = std::move(value);
            rejects([&] { (void)parse_input(bad); }, pointer);
        };
        bad_field("/schema_version", "2.0");
        bad_field("/schema_version", 1);
        bad_field("/floor/width", 0);
        bad_field("/floor/height", -1);
        bad_field("/floor/width", "1000");
        bad_field("/rooms/0/width", 0);
        bad_field("/rooms/0/height", -1);
        bad_field("/rooms/0/type", "kitchen");
        bad_field("/devices/0/type", "camera");
        bad_field("/devices/0/id", 12);
        bad_field("/devices/0/room_id", "unknown");
        bad_field("/devices/0/x", std::numeric_limits<double>::infinity());
        bad_field("/devices/0/y", std::numeric_limits<double>::quiet_NaN());
        bad_field("/gateways/0/active", 1);
        bad_field("/gateways/0/active", "true");
        bad_field("/gateways", nlohmann::json::object());
        bad_field("/requirements/coverage_required", 1.1);
        bad_field("/requirements/min_reliability", -0.1);
        bad_field("/requirements/max_latency_ms", -1);
        auto missing = base;
        missing["gateways"][0].erase("active");
        rejects([&] { (void)parse_input(missing); }, "missing nested field");
        auto duplicate = base;
        duplicate["devices"].push_back(duplicate["devices"][0]);
        rejects([&] { (void)parse_input(duplicate); }, "duplicate device ID");
        auto with_wall = base;
        with_wall["walls"].push_back({{"id", "w"}, {"x1", 1}, {"y1", 0}, {"x2", 1}, {"y2", 5}, {"material", "glass"}});
        rejects([&] { (void)parse_input(with_wall); }, "invalid material");
        with_wall["walls"][0]["material"] = "metal";
        with_wall["walls"].push_back(with_wall["walls"][0]);
        rejects([&] { (void)parse_input(with_wall); }, "duplicate wall ID");
        for (const auto& text : {"{", "", "null", "[]", "{} {}", "{\"x\":NaN}", "{\"x\":1e999}"}) {
            rejects([&] { std::istringstream stream(text); (void)load_input(stream); }, "invalid complete request");
        }
        auto huge = base;
        huge["devices"][0]["x"] = -1e308;
        huge["gateways"][0]["x"] = 1e308;
        rejects([&] { (void)evaluate_geometry(parse_input(huge)); }, "overflow is not JSON null");
        const auto error = error_response("INVALID_INPUT", "test");
        check(error["status"] == "error" && error["error"]["code"] == "INVALID_INPUT", "error schema");
        std::cout << checks << " checks passed\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "Test failed: " << e.what() << '\n';
        return 1;
    }
}
