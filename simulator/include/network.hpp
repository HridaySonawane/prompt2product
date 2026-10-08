#pragma once
#include "models.hpp"
#include <nlohmann/json.hpp>

namespace iot {
double estimated_rssi(double distance_units, double wall_loss_db, const SimulationConfig& config);
nlohmann::json evaluate_network(const SimulationInput& input, nlohmann::json response);
}
