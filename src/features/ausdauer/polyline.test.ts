import { describe, it, expect } from "vitest";
import { decodePolyline } from "./ausdauer-utils";

/** Mirror of the encoder used when saving a live-tracked activity. */
function encodePolyline(points: [number, number][]): string {
  let encoded = "";
  let pLat = 0;
  let pLng = 0;
  for (const [lat, lng] of points) {
    const dLat = Math.round(lat * 1e5) - pLat;
    const dLng = Math.round(lng * 1e5) - pLng;
    pLat += dLat;
    pLng += dLng;
    for (const d of [dLat, dLng]) {
      let v = d < 0 ? ~(d << 1) : d << 1;
      while (v >= 0x20) {
        encoded += String.fromCharCode(((v & 0x1f) | 0x20) + 63);
        v >>= 5;
      }
      encoded += String.fromCharCode(v + 63);
    }
  }
  return encoded;
}

describe("polyline encoding", () => {
  it("matches the reference example from the Google spec", () => {
    // The spec's worked example for (38.5,-120.2), (40.7,-120.95), (43.252,-126.453).
    const encoded = encodePolyline([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
    expect(encoded).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("survives a decode round-trip within 1e-5 precision", () => {
    const points: [number, number][] = [
      [50.1266, 8.6603],
      [50.1288, 8.6641],
      [50.1301, 8.6689],
      [50.1245, 8.6702],
    ];
    const decoded = decodePolyline(encodePolyline(points));
    expect(decoded).toHaveLength(points.length);
    decoded.forEach(([lat, lng], i) => {
      expect(lat).toBeCloseTo(points[i][0], 4);
      expect(lng).toBeCloseTo(points[i][1], 4);
    });
  });

  it("encodes deltas of 0x20 or more without collapsing them", () => {
    // A jump this large needs a continuation byte, which is exactly what the
    // previous operator precedence bug corrupted.
    const decoded = decodePolyline(
      encodePolyline([
        [50.0, 8.0],
        [50.5, 8.5],
      ]),
    );
    expect(decoded[1][0]).toBeCloseTo(50.5, 4);
    expect(decoded[1][1]).toBeCloseTo(8.5, 4);
  });
});
