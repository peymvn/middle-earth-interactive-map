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
window.ME_SETTLEMENTS = [
  { site: 'Minas Tirith', special: 'minasTirith', rot: 0, dx: -6200, dy: -1700 }, // moved onto the real eastern tip of the White Mountains in the DEM
  { site: 'Osgiliath', special: 'osgiliath' },
  { site: 'Minas Morgul', special: 'minasMorgul' },
  { site: 'Isengard', special: 'isengard' },
  { site: 'Barad-dûr', special: 'baradDur' },
  { name: 'Mount Doom', x: 1223200, y: 1338200, special: 'mountDoom' }, // the cone is in the DEM; we add the crater and lava
  { site: 'Morannon', special: 'blackGate' },
  { name: 'Argonath', x: 1086000, y: 1239200, special: 'argonath' },
  { site: 'Edoras', special: 'edoras' },
  { site: "Helm's Deep", special: 'helmsDeep' },
  { site: 'Caras Galadhon', special: 'carasGaladhon' },
  { name: 'Esgaroth', x: 1268000, y: 874200, special: 'laketown' },
  { site: 'Amon Sûl', special: 'weathertop' },
  { site: 'Hobbiton', special: 'hobbiton' },
  { site: 'Bree', special: 'bree' },
  { site: 'Rivendell', special: 'rivendell' },
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
  // Númenor (procedural island, see data/islands.js)
  { name: 'Armenelos', x: -962000, y: 1236000, kind: 'city', size: 700, style: 'gondor', walls: true },
  { name: 'Rómenna', x: -938500, y: 1255000, special: 'harbour', style: 'gondor', size: 520 },
  { name: 'Andúnië', x: -1019000, y: 1207000, special: 'harbour', style: 'elven', size: 380 },
  { name: 'Eldalondë', x: -1040000, y: 1254000, special: 'harbour', style: 'elven', size: 220 },
];
