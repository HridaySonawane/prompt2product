#include "geometry.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace iot {
namespace {
// Subtract before scaling so translating a normal-sized floor plan does not
// introduce cancellation from dividing large absolute coordinates first.
// Fall back to scaled coordinates only when subtraction itself would overflow.
int side(Point a, Point b, Point p) {
    double dx = b.x - a.x, dy = b.y - a.y;
    double px = p.x - a.x, py = p.y - a.y;
    double scale;
    if (std::isfinite(dx) && std::isfinite(dy) && std::isfinite(px) && std::isfinite(py)) {
        scale = std::max({std::abs(dx), std::abs(dy), std::abs(px), std::abs(py), 1.0});
        dx /= scale; dy /= scale; px /= scale; py /= scale;
    } else {
        scale = std::max({std::abs(a.x), std::abs(a.y), std::abs(b.x),
                          std::abs(b.y), std::abs(p.x), std::abs(p.y), 1.0});
        dx = b.x / scale - a.x / scale; dy = b.y / scale - a.y / scale;
        px = p.x / scale - a.x / scale; py = p.y / scale - a.y / scale;
    }
    const double length = std::hypot(dx, dy);
    if (length == 0.0) return 0;
    const double left = (dx / length) * py, right = (dy / length) * px;
    const double perpendicular = left - right;
    const double rounding_bound = 8 * std::numeric_limits<double>::epsilon() *
                                  (std::abs(left) + std::abs(right));
    const double tolerance = geometry_tolerance / scale + rounding_bound;
    return perpendicular > tolerance ? 1 : (perpendicular < -tolerance ? -1 : 0);
}
bool on_segment(Point a, Point b, Point p) {
    return side(a, b, p) == 0 &&
        p.x >= std::min(a.x, b.x) - geometry_tolerance &&
        p.x <= std::max(a.x, b.x) + geometry_tolerance &&
        p.y >= std::min(a.y, b.y) - geometry_tolerance &&
        p.y <= std::max(a.y, b.y) + geometry_tolerance;
}
bool proper_crossing(Point a, Point b, Point c, Point d) {
    return side(a, b, c) * side(a, b, d) == -1 &&
           side(c, d, a) * side(c, d, b) == -1;
}
} // namespace

double distance(Point a, Point b) { return std::hypot(b.x - a.x, b.y - a.y); }
bool point_inside_room(Point p, const Room& r) {
    return p.x >= r.x - geometry_tolerance && p.y >= r.y - geometry_tolerance &&
           p.x <= r.x + r.width + geometry_tolerance &&
           p.y <= r.y + r.height + geometry_tolerance;
}
bool segments_intersect(Point a, Point b, Point c, Point d) {
    return proper_crossing(a, b, c, d) || on_segment(a, b, c) ||
           on_segment(a, b, d) || on_segment(c, d, a) || on_segment(c, d, b);
}
bool crosses_wall(Point source, Point destination, const Wall& wall) {
    return proper_crossing(source, destination, {wall.x1, wall.y1}, {wall.x2, wall.y2});
}
std::size_t count_intersected_walls(Point source, Point destination,
                                   const std::vector<Wall>& walls) {
    return static_cast<std::size_t>(std::count_if(walls.begin(), walls.end(),
        [&](const Wall& wall) { return crosses_wall(source, destination, wall); }));
}
double material_attenuation(Material material, const AttenuationAssumptions& a) {
    switch (material) {
        case Material::Drywall: return a.drywall;
        case Material::Wood: return a.wood;
        case Material::Concrete: return a.concrete;
        case Material::Metal: return a.metal;
    }
    throw std::invalid_argument("Unsupported wall material");
}
double total_wall_attenuation(Point source, Point destination,
                             const std::vector<Wall>& walls, const AttenuationAssumptions& a) {
    double total = 0;
    for (const auto& wall : walls)
        if (crosses_wall(source, destination, wall)) total += material_attenuation(wall.material, a);
    return total;
}
std::vector<GeometryLink> evaluate_geometry(const SimulationInput& input,
                                          const AttenuationAssumptions& a) {
    std::vector<GeometryLink> links;
    for (const auto& device : input.devices) {
        for (const auto& gateway : input.gateways) {
            const Point source{device.x, device.y}, destination{gateway.x, gateway.y};
            const double d = distance(source, destination);
            const double attenuation = total_wall_attenuation(source, destination, input.walls, a);
            if (!std::isfinite(d) || !std::isfinite(attenuation))
                throw std::invalid_argument("Geometry result exceeds finite numeric range");
            links.push_back({device.id, gateway.id, d,
                             count_intersected_walls(source, destination, input.walls), attenuation});
        }
    }
    return links;
}
} // namespace iot
