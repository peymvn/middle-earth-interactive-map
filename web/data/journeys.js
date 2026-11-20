// Routes of the main journeys, drawn like Google directions. Waypoints are place names (from
// places.js or ME-GIS), [east, south] map kilometres, or { at: <name or [e, s]>, by: 'river' | 'foot' }
// to say how the traveller reached that waypoint: by boat along the river, or overland off the
// roads. Otherwise the leg follows the roads when a sensible road route exists (js/routes.js). Routes are
// approximate: they follow the text of the books and Karen Wynn Fonstad's Atlas of Middle-earth
// where the text is vague. Improve them freely.
window.ME_JOURNEYS = [
  { id: 'bilbo', name: "Bilbo: There and Back Again", color: '#2e7d32', book: 'The Hobbit (T.A. 2941)',
    // The Hobbit: the Green Dragon at Bywater, east along the Road past Bree and the Last Bridge, the
    // trolls in the Trollshaws, the Ford and Rivendell; over the High Pass, captured at Goblin-town, the
    // Eagles to the Carrock, Beorn, the Elf-path through Mirkwood, the Elvenking's halls, barrels down
    // the Forest River to Lake-town, up the Long Lake by boat and round to the Mountain's western side
    pts: ['Hobbiton', 'Bywater', 'Brandywine Bridge', 'Bree', 'The Last Bridge', { at: [800, 950], by: 'foot' }, { at: 'Trollshaws', by: 'foot' }, { at: [850, 955], by: 'foot' }, 'Ford of Bruinen', 'Rivendell',
      { at: [930, 925], by: 'foot' }, { at: 'High Pass', by: 'foot' }, { at: 'Goblin-town', by: 'foot' }, { at: [1000, 905], by: 'foot' }, { at: 'The Carrock', by: 'foot' }, { at: "Beorn's House", by: 'foot' },
      { at: [1092, 893], by: 'foot' }, { at: [1140, 890], by: 'foot' }, { at: 'Enchanted River', by: 'foot' }, { at: [1210, 872], by: 'foot' }, { at: "Thranduil's Halls", by: 'foot' },
      { at: [1245, 860], by: 'foot' }, { at: [1266, 872], by: 'foot' }, { at: 'Lake-town', by: 'foot' }, { at: [1275, 858], by: 'foot' }, { at: [1273, 849], by: 'foot' }, { at: [1266, 838], by: 'foot' }, { at: [1252, 826], by: 'foot' }, { at: 'Erebor', by: 'foot' }],
    // The way back (dashed). Bilbo and Gandalf rode with Beorn round the northern edge of Mirkwood and
    // spent Yule at Beorn's house; from there they retraced the outward road (High Pass, Rivendell,
    // the troll-gold, Bree) to Hobbiton, so that part isn't drawn a second time.
    back: ['Erebor', { at: [1232, 786], by: 'foot' }, { at: [1175, 772], by: 'foot' }, { at: [1110, 778], by: 'foot' }, { at: [1078, 815], by: 'foot' }, { at: [1066, 865], by: 'foot' }, { at: "Beorn's House", by: 'foot' }],
    backNote: 'from Beorn’s house home by the same road' },
  { id: 'frodo', name: 'Frodo & Sam', color: '#1a73e8', book: 'The Lord of the Rings (3018–3019)',
    pts: [
      // Book I: across country from Bag End towards Woody End, the elves at Woodhall, the short cut to
      // Farmer Maggot's farm at Bamfurlong, his cart to Bucklebury Ferry, over the Brandywine to Crickhollow
      'Hobbiton', { at: [524, 962], by: 'foot' }, { at: [529, 968.5], by: 'foot' }, { at: [536, 971], by: 'foot' }, { at: 'Woodhall', by: 'foot' },
      { at: [545, 972.5], by: 'foot' }, { at: 'Bamfurlong', by: 'foot' }, { at: [551, 971.5], by: 'foot' }, { at: 'Bucklebury Ferry', by: 'foot' },
      { at: [554.9, 969.4], by: 'foot' }, { at: [556.2, 968.8], by: 'foot' }, { at: [560.5, 966.8], by: 'foot' }, { at: 'Crickhollow', by: 'foot' },
      // through the Hedge into the Old Forest, down the Withywindle to Tom Bombadil, over the Barrow-downs to the Road
      { at: [567.5, 970.5], by: 'foot' }, { at: [573, 975], by: 'foot' }, { at: [580, 980], by: 'foot' }, { at: "Tom Bombadil's House", by: 'foot' },
      { at: 'Barrow-downs', by: 'foot' }, { at: [596, 962], by: 'foot' }, 'Bree',
      // Strider's way: off the Road through the Chetwood and the Midgewater Marshes to Weathertop
      { at: 'Chetwood', by: 'foot' }, { at: 'Midgewater Marshes', by: 'foot' }, { at: [652, 945], by: 'foot' }, { at: 'Weathertop', by: 'foot' },
      // south to the Road, the Last Bridge, north into the Trollshaws, back to the Road and the Ford
      { at: [690, 958], by: 'foot' }, 'The Last Bridge', { at: [790, 945], by: 'foot' }, { at: 'Trollshaws', by: 'foot' }, { at: [850, 955], by: 'foot' }, 'Ford of Bruinen', 'Rivendell',
      // the Fellowship: south through Hollin, the Redhorn Gate attempt on Caradhras, back down and along
      // the Sirannon to the West-gate, through Moria to Dimrill Dale, down the Silverlode to Lórien
      { at: [855, 985], by: 'foot' }, { at: [825, 1030], by: 'foot' }, { at: [848, 1052], by: 'foot' }, { at: 'Caradhras', by: 'foot' },
      { at: [846, 1056], by: 'foot' }, { at: [818, 1078], by: 'foot' }, { at: [812, 1092], by: 'foot' }, { at: [834, 1086], by: 'foot' }, { at: 'Moria', by: 'foot' },
      { at: 'Dimrill Dale', by: 'foot' }, { at: [912, 1086], by: 'foot' }, { at: 'Nimrodel', by: 'foot' }, { at: 'Caras Galadhon', by: 'foot' },
      // by boat down the Anduin from the Silverlode's mouth, the portage at Sarn Gebir, the Argonath, across
      // Nen Hithoel to the lawn of Parth Galen under Amon Hen (the Parth Galen label sits south of our lake)
      { at: [988, 1092], by: 'foot' }, { at: 'Sarn Gebir', by: 'river' }, { at: 'Argonath', by: 'foot' }, { at: [1080, 1247], by: 'foot' }, { at: [1074.5, 1255.5], by: 'foot' }, { at: 'Amon Hen', by: 'foot' },
      // Frodo and Sam alone: back to the boats, across the lake under Amon Lhaw, east through the Emyn Muil
      { at: [1074.5, 1255.5], by: 'foot' }, { at: [1080, 1254], by: 'foot' }, { at: [1086, 1251], by: 'foot' }, { at: [1093, 1248], by: 'foot' }, { at: [1104, 1243], by: 'foot' }, { at: [1120, 1236], by: 'foot' }, { at: [1131, 1239], by: 'foot' },
      // Gollum leads them through the Dead Marshes and over Dagorlad to the Black Gate, then south into Ithilien
      { at: 'Dead Marshes', by: 'foot' }, { at: [1163, 1262], by: 'foot' }, { at: [1177, 1273], by: 'foot' }, { at: [1160, 1290], by: 'foot' }, { at: [1153, 1305], by: 'foot' },
      { at: 'Henneth Annûn', by: 'foot' }, { at: [1158, 1340], by: 'foot' }, { at: 'Cross-roads', by: 'foot' },
      // up the Morgul Vale to the stairs, Shelob's Lair and the Tower of Cirith Ungol
      { at: [1174, 1360], by: 'foot' }, { at: 'Cirith Ungol', by: 'foot' },
      // down into Mordor, north in the trench below the Morgai, swept along with orcs towards the Isenmouthe,
      // then east and south across Gorgoroth to Mount Doom
      { at: [1198, 1350], by: 'foot' }, { at: [1197, 1325], by: 'foot' }, { at: [1192, 1311], by: 'foot' }, { at: [1206, 1320], by: 'foot' }, { at: 'Mount Doom', by: 'foot' }] },
  { id: 'aragorn', name: 'Aragorn, Legolas & Gimli', color: '#c5221f', book: 'From Amon Hen (26 Feb 3019)',
    pts: [
      // hunting the Uruk-hai: west over the Emyn Muil's western hills and across the Eastemnet to Fangorn
      'Amon Hen', { at: [1060, 1235], by: 'foot' }, { at: [1010, 1200], by: 'foot' }, { at: 'Eastemnet', by: 'foot' }, { at: [920, 1178], by: 'foot' }, { at: 'Fangorn Forest', by: 'foot' },
      // with Gandalf to Edoras, west with Théoden's host towards the Fords of Isen, turned aside to Helm's Deep
      { at: [890, 1200], by: 'foot' }, { at: [872, 1240], by: 'foot' }, 'Edoras', { at: 'Westfold', by: 'foot' }, { at: "Helm's Deep", by: 'foot' },
      // to Isengard by the Fords of Isen, back by Dol Baran to the Hornburg, then the road to Edoras and Dunharrow
      { at: 'Fords of Isen', by: 'foot' }, 'Isengard', { at: 'Dol Baran', by: 'foot' }, { at: "Helm's Deep", by: 'foot' }, 'Edoras', { at: 'Dunharrow', by: 'foot' },
      // the Paths of the Dead to Erech, through Lamedon (Calembel), Linhir, Pelargir; the black ships up the Anduin
      { at: 'Erech', by: 'foot' }, { at: 'Calembel', by: 'foot' }, { at: 'Linhir', by: 'foot' }, { at: 'Pelargir', by: 'foot' }, { at: 'Harlond', by: 'river' }, { at: 'Minas Tirith', by: 'foot' },
      // the Army of the West: Osgiliath, the Cross-roads, north through Ithilien to the Morannon
      'Osgiliath', 'Cross-roads', 'The Black Gate'] },
  { id: 'merry-pippin', name: 'Merry & Pippin', color: '#e37400', book: 'Captured at Amon Hen',
    pts: ['Amon Hen', { at: [1050, 1220], by: 'foot' }, { at: [1010, 1196], by: 'foot' }, { at: 'Eastemnet', by: 'foot' }, { at: [912, 1176], by: 'foot' },
      { at: 'Fangorn Forest', by: 'foot' }, { at: [860, 1172], by: 'foot' }, { at: 'Wellinghall', by: 'foot' }, { at: 'Derndingle', by: 'foot' }, { at: 'Isengard', by: 'foot' }] },
  { id: 'gandalf', name: 'Gandalf the White', color: '#9334e6', book: 'From Fangorn to the Black Gate',
    pts: [
      'Fangorn Forest', { at: [890, 1200], by: 'foot' }, { at: [872, 1240], by: 'foot' }, 'Edoras', { at: 'Westfold', by: 'foot' }, { at: "Helm's Deep", by: 'foot' },
      { at: 'Fords of Isen', by: 'foot' }, 'Isengard', { at: 'Dol Baran', by: 'foot' },
      // Shadowfax's ride with Pippin across Rohan and down the line of the beacons to Minas Tirith
      { at: [850, 1240], by: 'foot' }, { at: [920, 1280], by: 'foot' }, { at: 'Halifirien', by: 'foot' }, { at: 'Min-Rimmon', by: 'foot' }, { at: 'Amon Dîn', by: 'foot' }, { at: 'Minas Tirith', by: 'foot' },
      'Osgiliath', 'Cross-roads', 'The Black Gate'] },
  { id: 'rohirrim', name: 'The Ride of the Rohirrim', color: '#b06000', book: '10–15 March 3019',
    // from the muster at Dunharrow down to Edoras, east along the Great West Road through Anórien, then the
    // Wild Men's hidden way through the Drúadan Forest and the Stonewain Valley to the Pelennor
    pts: ['Dunharrow', 'Edoras', { at: 'Halifirien', by: 'road' }, { at: [1080, 1345], by: 'road' }, { at: 'Drúadan Forest', by: 'foot' }, { at: 'Stonewain Valley', by: 'foot' }, { at: 'Pelennor Fields', by: 'foot' }] },
];
