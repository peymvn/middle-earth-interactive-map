// Routes of the main journeys, drawn like Google directions. Waypoints are place names (from
// places.js or ME-GIS), [east, south] map kilometres, or { at: <name or [e, s]>, by: 'river' | 'foot' }
// to say how the traveller reached that waypoint: by boat along the river, or overland off the
// roads. Otherwise the leg follows the roads when a sensible road route exists (js/routes.js). Routes are
// approximate: they follow the text of the books and Karen Wynn Fonstad's Atlas of Middle-earth
// where the text is vague. Improve them freely.
window.ME_JOURNEYS = [
  { id: 'bilbo', name: "Bilbo: There and Back Again", color: '#2e7d32', book: 'The Hobbit (T.A. 2941)',
    pts: ['Hobbiton', 'Bywater', 'Brandywine Bridge', 'Bree', [640, 951], 'Weathertop', 'The Last Bridge', [800, 950], 'Trollshaws', 'Ford of Bruinen', 'Rivendell',
      [930, 925], 'Goblin-town', [1000, 905], 'The Carrock', [1052, 900], [1110, 895], [1180, 880], [1225, 865], "Thranduil's Halls", { at: 'Lake-town', by: 'river' }, [1262, 840], 'Erebor',
      [1240, 850], [1120, 900], [1040, 905], [960, 925], 'Rivendell', 'Ford of Bruinen', 'Weathertop', 'Bree', 'Brandywine Bridge', 'Hobbiton'] },
  { id: 'frodo', name: 'Frodo & Sam', color: '#1a73e8', book: 'The Lord of the Rings (3018–3019)',
    pts: ['Hobbiton', [532, 966], [548, 975], 'Crickhollow', 'The Old Forest', "Tom Bombadil's House", 'Barrow-downs', 'Bree', 'Midgewater Marshes', 'Weathertop', 'The Last Bridge', 'Trollshaws', 'Ford of Bruinen', 'Rivendell',
      { at: [855, 985], by: 'foot' }, { at: [825, 1030], by: 'foot' }, { at: [848, 1052], by: 'foot' }, { at: 'Caradhras', by: 'foot' }, { at: [852, 1068], by: 'foot' }, { at: 'Moria', by: 'foot' }, { at: 'Dimrill Dale', by: 'foot' }, { at: 'Caras Galadhon', by: 'foot' }, { at: [990, 1095], by: 'foot' }, { at: [1062, 1205], by: 'river' }, { at: 'Argonath', by: 'river' }, { at: 'Amon Hen', by: 'river' },
      { at: 'Emyn Muil', by: 'foot' }, { at: 'Dead Marshes', by: 'foot' }, { at: [1180, 1268], by: 'foot' }, [1165, 1300], { at: 'Henneth Annûn', by: 'foot' }, 'Cross-roads', { at: 'Cirith Ungol', by: 'foot' }, { at: [1205, 1335], by: 'foot' }, { at: 'Mount Doom', by: 'foot' }] },
  { id: 'aragorn', name: 'Aragorn, Legolas & Gimli', color: '#c5221f', book: 'From Amon Hen (26 Feb 3019)',
    pts: ['Amon Hen', { at: [1060, 1235], by: 'foot' }, { at: [1010, 1200], by: 'foot' }, { at: [940, 1185], by: 'foot' }, { at: 'Fangorn Forest', by: 'foot' }, { at: [880, 1215], by: 'foot' }, 'Edoras', [830, 1245], "Helm's Deep", [800, 1220], 'Isengard', [830, 1235], 'Edoras', 'Dunharrow', { at: 'Erech', by: 'foot' }, [960, 1400], [1020, 1440], 'Pelargir', { at: 'Harlond', by: 'river' }, 'Minas Tirith', 'Osgiliath', [1170, 1320], 'The Black Gate'] },
  { id: 'merry-pippin', name: 'Merry & Pippin', color: '#e37400', book: 'Captured at Amon Hen',
    pts: ['Amon Hen', { at: [1050, 1220], by: 'foot' }, { at: [990, 1190], by: 'foot' }, { at: [930, 1175], by: 'foot' }, { at: 'Fangorn Forest', by: 'foot' }, { at: 'Derndingle', by: 'foot' }, { at: 'Isengard', by: 'foot' }] },
  { id: 'gandalf', name: 'Gandalf the White', color: '#9334e6', book: 'From Fangorn to the Black Gate',
    pts: ['Fangorn Forest', 'Edoras', "Helm's Deep", 'Isengard', [860, 1250], 'Edoras', [960, 1300], 'Amon Dîn', 'Minas Tirith', 'Osgiliath', [1170, 1320], 'The Black Gate'] },
  { id: 'rohirrim', name: 'The Ride of the Rohirrim', color: '#b06000', book: '10–15 March 3019',
    pts: ['Dunharrow', 'Edoras', [930, 1295], [1000, 1325], [1060, 1340], [1095, 1355], 'Pelennor Fields'] },
];
