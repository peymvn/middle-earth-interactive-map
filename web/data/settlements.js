// Curated settlement overrides for the procedural building generator (web/js/engine/settlements.js).
//
// Every point in the ME-GIS layers (cities, towns, villages, citadels, towers, ruins, beacons) gets
// a procedurally generated settlement automatically. Entries here refine that:
//   site   : name of the ME-GIS point to attach to (or give x/y in map units instead)
//   dx, dy : nudge in map units (positive = east / south)
//   special: a hand-built landmark generator (see SPECIALS in settlements.js)
//   kind   : city | town | village | hamlet | fort | tower | ruin | beacon
//   size   : radius in map units (1 mu ~ 1.6 m)
//   style  : override the culture style (hobbit, bree, rohan, gondor, elven, dale, harad, mordor, ...)
//   rot    : rotation in degrees for specials (0 = as designed, see each special)
//   hide   : true to suppress a GIS point that is wrong or duplicated
//   model  : a 3D model from js/three/models.js, shown in the 3D view and laid over the satellite map
//            from zoom 12 (2D drawings of that settlement are then hidden); extraModels adds more
//            3D scenes to the same place; places lists the place names whose cards offer the 3D view
window.ME_SETTLEMENTS = [
  { site: 'Minas Tirith', special: 'minasTirith', model: 'minasTirith', rot: 0, dx: -6200, dy: -1700 }, // moved onto the real eastern tip of the White Mountains in the DEM
  { site: 'Osgiliath', special: 'osgiliath' },
  { site: 'Minas Morgul', special: 'minasMorgul' },
  { site: 'Isengard', special: 'isengard', model: 'isengard', places: ['Isengard', 'Orthanc'] },
  { site: 'Barad-dûr', special: 'baradDur', model: 'baradDur' },
  { name: 'Mount Doom', x: 1223200, y: 1338200, special: 'mountDoom' }, // the cone is in the DEM; we add the crater and lava
  { site: 'Morannon', special: 'blackGate' },
  { name: 'Argonath', x: 1086000, y: 1239200, special: 'argonath', model: 'argonath' },
  { site: 'Edoras', special: 'edoras', model: 'edoras' },
  { site: "Helm's Deep", special: 'helmsDeep' },
  { site: 'Caras Galadhon', special: 'carasGaladhon', model: 'carasGaladhon', places: ['Caras Galadhon', 'Lothlórien'] },
  { name: 'Esgaroth', x: 1273000, y: 870000, special: 'laketown' }, // on piles in the lake, near its western shore
  { site: 'Amon Sûl', special: 'weathertop' },
  { site: 'Hobbiton', special: 'hobbiton', model: 'bagEnd', places: ['Hobbiton', 'Bag End', 'Bywater'] },
  { site: 'Bree', special: 'bree' },
  { site: 'Rivendell', special: 'rivendell', model: 'rivendell' },
  { site: 'Mithlond', special: 'harbour', style: 'elven', size: 420 },
  { site: 'Pelargir', special: 'harbour', style: 'gondor', size: 520, walls: true },
  { site: 'Umbar', special: 'harbour', style: 'harad', size: 750, walls: true },
  { site: 'Dol Amroth', special: 'harbour', style: 'gondor', size: 480, walls: true },
  { site: 'Dale', kind: 'city', size: 330, walls: true, style: 'dale' },
  { site: 'Cirith Ungol', special: 'cirithUngol' },
  { site: 'Dol Guldur', kind: 'fort', size: 260, style: 'mordor', walls: true },
  { site: 'Fornost', kind: 'ruin', size: 520 },
  { site: 'Tharbad', kind: 'ruin', size: 380 },
  { site: 'Annúminas', kind: 'ruin', size: 450 },
  // 3D-only landmarks (no 2D settlement of their own)
  { name: 'Erebor Front Gate', x: 1262300, y: 818500, special: 'none', model: 'erebor', places: ['Erebor', 'Lonely Mountain'] },
  { name: 'West-gate of Moria', site: 'Khazad-dûm', special: 'none', model: 'moriaGate', extraModels: ['bridgeKhazadDum'], places: ['Moria', 'Khazad-dûm', 'Doors of Durin'] },
  { name: 'Derndingle', x: 848000, y: 1182200, special: 'none', model: 'derndingle', places: ['Derndingle', 'Wellinghall'] },
  // Númenor (procedural island, see data/islands.js)
  { name: 'Armenelos', x: -962000, y: 1236000, kind: 'city', size: 700, style: 'gondor', walls: true },
  { name: 'Rómenna', x: -938500, y: 1255000, special: 'harbour', style: 'gondor', size: 520 },
  { name: 'Andúnië', x: -1019000, y: 1207000, special: 'harbour', style: 'elven', size: 380 },
  { name: 'Eldalondë', x: -1040000, y: 1254000, special: 'harbour', style: 'elven', size: 220 },
];
