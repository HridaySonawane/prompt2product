#pragma once
#include "models.hpp"
#include <istream>
#include <nlohmann/json.hpp>

namespace iot {
SimulationInput parse_input(const nlohmann::json& json);
SimulationInput load_input(std::istream& stream);
nlohmann::json serialize_input(const SimulationInput& input);
nlohmann::json success_response(const std::vector<GeometryLink>& links);
nlohmann::json error_response(const std::string& code, const std::string& message);
} // namespace iot
