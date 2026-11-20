// Islands beyond the edge of the elevation model, generated procedurally in the tile worker.
// The DEM ends a little west of Lindon; anything with x < 0 is open ocean unless an island here
// claims it. Coordinates are map km [east, south] (negative east = west of the DEM).
//
// Númenor (Elenna, Westernesse) is drawn as it was at its height in the Second Age. It was drowned
// in the Downfall (S.A. 3319), so in the Third Age only the sea remains here. Its size follows the
// Description of Númenor in Unfinished Tales (about 250 miles across). Its distance from Lindon is
// an artistic choice, as Tolkien gives none on the maps.
window.ME_ISLANDS = [
  {
    name: 'Númenor', center: [-980, 1240],
    base: 46,            // km radius of the central land (Mittalmar)
    // five promontories: angle in degrees (0 = east, 90 = south), length km, half-width (radians)
    prongs: [
      { name: 'Forostar', angle: -95, len: 78, w: 0.30 },
      { name: 'Andustar', angle: -165, len: 80, w: 0.26 },
      { name: 'Hyarnustar', angle: 140, len: 92, w: 0.34 },
      { name: 'Hyarrostar', angle: 62, len: 82, w: 0.30 },
      { name: 'Orrostar', angle: -18, len: 74, w: 0.26 },
    ],
    peak: { at: [0, 0], height: 1750, radius: 8 },   // the Meneltarma, Pillar of Heaven
    hills: 520,          // general height of the uplands (m)
    forest: { at: [-55, 10], radius: 60 },           // Nísimaldar, the fragrant woods of the west
  },
];
