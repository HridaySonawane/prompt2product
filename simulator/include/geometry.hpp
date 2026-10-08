#pragma once
#include "models.hpp"

namespace iot {
// Absolute perpendicular distance / bounding-box tolerance in logical units.
inline constexpr double geometry_tolerance = 1e-9;
double distance(Point a, Point b);
bool point_inside_room(Point point, const Room& room);
// Inclusive: endpoint contacts, overlap and zero-length segments are supported.
bool segments_intersect(Point a, Point b, Point c, Point d);
// Strict crossing: both segment interiors must cross transversely.
// Endpoint-only contact, collinear overlap and degenerate segments do not penetrate.
bool crosses_wall(Point source, Point destination, const Wall& wall);
std::size_t count_intersected_walls(Point source, Point destination,
                                   const std::vector<Wall>& walls);
double material_attenuation(Material material,
                            const AttenuationAssumptions& assumptions = {});
double total_wall_attenuation(Point source, Point destination,
                             const std::vector<Wall>& walls,
                             const AttenuationAssumptions& assumptions = {});
std::vector<GeometryLink> evaluate_geometry(const SimulationInput& input,
                                          const AttenuationAssumptions& assumptions = {});
} // namespace iot
