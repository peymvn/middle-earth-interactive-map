// Hand-authored climate & culture zones that drive the satellite colours and building styles.
// Coordinates are map kilometres: [east, south] from the north-west corner of the map
// (Hobbiton is about [519, 956], Minas Tirith [1122, 1382]). Use the "What's here?"
// right-click menu in the map to read coordinates.
//
// Field meanings (all optional, blended with a soft edge of `feather` km):
//   moist  : added to moisture   (-1 desert ... +1 rain forest). Base moisture falls from west to east.
//   heat   : added to temperature (base temperature rises from north to south)
//   blight : 0..1 dead/ash land (Mordor, Desolation of Smaug, Brown Lands)
//   cult   : 0..1 how much of the land is farmed (field patchwork)
//   grass  : 0..1 open grassland, suppresses scattered trees (Rohan)
window.ME_CLIMATE = {
  regions: [
    // --- the wet north-west and the Shire
    { name: 'Lindon', moist: 0.25, feather: 60, poly: [[150, 600], [420, 600], [420, 1150], [150, 1150]] },
    { name: 'The Shire (farmland)', cult: 0.85, moist: 0.15, feather: 18,
      poly: [[455, 925], [505, 905], [560, 920], [585, 960], [575, 1000], [540, 1010], [490, 995], [455, 975]] },
    { name: 'Buckland', cult: 0.6, feather: 6, poly: [[560, 960], [575, 960], [578, 990], [562, 992]] },
    { name: 'Bree-land', cult: 0.6, feather: 8, poly: [[590, 945], [612, 945], [612, 965], [590, 965]] },
    { name: 'Old Forest & Barrow-downs damp', moist: 0.2, feather: 15, poly: [[570, 960], [610, 960], [610, 1000], [570, 1000]] },
    // --- Eriador: emptied, wild grassland and heath
    { name: 'Eriador wilds', moist: -0.05, feather: 120, poly: [[600, 850], [820, 850], [820, 1150], [600, 1150]] },
    { name: 'Minhiriath & Enedwaith (dry heath)', moist: -0.12, heat: 0.03, feather: 70, poly: [[450, 1080], [760, 1080], [760, 1260], [450, 1260]] },
    { name: 'Dunland', cult: 0.35, moist: 0.05, feather: 25, poly: [[735, 1070], [790, 1070], [800, 1140], [745, 1150]] },
    { name: 'Angmar (cold blight)', blight: 0.3, heat: -0.08, feather: 60, poly: [[760, 650], [900, 650], [900, 820], [760, 820]] },
    // --- the far north
    { name: 'Forodwaith', heat: -0.25, moist: -0.15, feather: 140, poly: [[0, 0], [2001, 0], [2001, 420], [0, 420]] },
    { name: 'Forochel', heat: -0.15, feather: 80, poly: [[250, 250], [700, 250], [700, 520], [250, 520]] },
    // --- Rhovanion
    { name: 'Vales of Anduin', moist: 0.12, cult: 0.12, feather: 40, poly: [[990, 820], [1070, 820], [1080, 1080], [1000, 1080]] },
    { name: 'Beorn & Woodmen lands', cult: 0.3, feather: 15, poly: [[1030, 880], [1070, 880], [1070, 940], [1030, 940]] },
    { name: 'Desolation of the Dragon', blight: 0.5, moist: -0.2, feather: 25, poly: [[1230, 790], [1295, 790], [1300, 860], [1235, 860]] },
    { name: 'Dale & Long Lake farms', cult: 0.55, blight: -0.6, feather: 10, poly: [[1250, 818], [1272, 818], [1275, 885], [1255, 885]] },
    { name: 'Withered Heath', blight: 0.6, heat: -0.05, feather: 30, poly: [[1210, 680], [1310, 680], [1310, 760], [1210, 760]] },
    { name: 'Iron Hills', moist: -0.05, feather: 40, poly: [[1320, 760], [1420, 760], [1420, 840], [1320, 840]] },
    { name: 'Dorwinion (vineyards)', cult: 0.6, heat: 0.06, feather: 40, poly: [[1420, 1010], [1500, 1010], [1500, 1090], [1420, 1090]] },
    { name: 'Rhûn steppe', moist: -0.35, heat: 0.05, feather: 160, poly: [[1450, 900], [2001, 900], [2001, 1450], [1450, 1450]] },
    { name: 'Brown Lands', blight: 0.45, moist: -0.35, feather: 35, poly: [[1060, 1110], [1170, 1110], [1175, 1215], [1065, 1215]] },
    { name: 'Dagorlad', blight: 0.4, moist: -0.3, feather: 25, poly: [[1150, 1215], [1240, 1215], [1240, 1275], [1150, 1275]] },
    { name: 'Dead Marshes', blight: 0.35, moist: 0.4, feather: 15, poly: [[1120, 1225], [1165, 1225], [1165, 1260], [1120, 1260]] },
    { name: 'Wold & Emyn Muil (bare)', moist: -0.15, feather: 30, poly: [[1050, 1160], [1135, 1160], [1135, 1235], [1050, 1235]] },
    // --- Rohan
    { name: 'Rohan grassland', grass: 0.9, moist: -0.08, feather: 50, poly: [[830, 1160], [1050, 1160], [1060, 1310], [820, 1310]] },
    { name: 'Westfold & Edoras farms', cult: 0.4, feather: 18, poly: [[800, 1240], [900, 1240], [900, 1290], [800, 1290]] },
    // --- Gondor
    { name: 'Gondor', heat: 0.05, moist: 0.05, cult: 0.35, feather: 60, poly: [[760, 1310], [1180, 1310], [1180, 1560], [760, 1560]] },
    { name: 'Pelennor & Anórien', cult: 0.7, feather: 15, poly: [[1050, 1320], [1135, 1330], [1140, 1400], [1100, 1400], [1050, 1360]] },
    { name: 'Lebennin & Lossarnach', cult: 0.65, moist: 0.08, feather: 25, poly: [[1000, 1400], [1110, 1400], [1100, 1500], [990, 1500]] },
    { name: 'Belfalas & Dor-en-Ernil', cult: 0.55, feather: 25, poly: [[840, 1430], [990, 1430], [990, 1510], [840, 1510]] },
    { name: 'Ithilien (garden of Gondor)', moist: 0.18, cult: 0.1, feather: 15, poly: [[1145, 1300], [1185, 1300], [1190, 1460], [1140, 1460]] },
    // --- Mordor
    { name: 'Mordor', blight: 0.55, moist: -0.35, heat: 0.03, feather: 18,
      poly: [[1190, 1282], [1300, 1272], [1420, 1280], [1540, 1292], [1545, 1330], [1470, 1345], [1520, 1420], [1530, 1500], [1480, 1545], [1380, 1560], [1250, 1565], [1205, 1545], [1198, 1450], [1192, 1350]] },
    { name: 'Gorgoroth', blight: 0.6, moist: -0.25, feather: 20, poly: [[1196, 1288], [1300, 1282], [1365, 1300], [1350, 1360], [1300, 1400], [1240, 1410], [1200, 1395]] },
    { name: 'Nurn (slave farms)', blight: -0.3, cult: 0.5, moist: 0.08, feather: 25, poly: [[1240, 1415], [1340, 1405], [1470, 1430], [1515, 1510], [1470, 1540], [1260, 1550], [1215, 1500]] },
    { name: 'Morgai & Udûn', blight: 0.3, feather: 12, poly: [[1175, 1270], [1200, 1270], [1205, 1320], [1180, 1325]] },
    // --- the south
    { name: 'Harondor', moist: -0.35, heat: 0.08, feather: 60, poly: [[1000, 1520], [1250, 1520], [1250, 1680], [1000, 1680]] },
    { name: 'Harad desert', moist: -0.75, heat: 0.2, feather: 120, poly: [[900, 1650], [2001, 1650], [2001, 2001], [900, 2001]] },
    { name: 'Near Harad river valleys', moist: 0.35, cult: 0.45, feather: 25, poly: [[990, 1660], [1960, 1660], [1960, 1760], [990, 1760]] },
    { name: 'Umbar', cult: 0.45, moist: 0.15, feather: 30, poly: [[930, 1840], [1020, 1840], [1020, 1920], [930, 1920]] },
    { name: 'Khand', moist: -0.4, heat: 0.12, feather: 100, poly: [[1600, 1450], [2001, 1450], [2001, 1650], [1600, 1650]] },
  ],

  // Building style for procedural settlements. First polygon that contains the settlement wins;
  // the fallback is 'mannish'.
  cultures: [
    { style: 'hobbit', poly: [[440, 900], [600, 900], [600, 1010], [440, 1010]] },
    { style: 'bree', poly: [[585, 935], [630, 935], [630, 975], [585, 975]] },
    { style: 'elven', poly: [[150, 820], [400, 820], [400, 1120], [150, 1120]] },
    { style: 'rohan', poly: [[790, 1160], [1060, 1160], [1060, 1310], [790, 1310]] },
    { style: 'gondor', poly: [[740, 1310], [1185, 1300], [1185, 1600], [740, 1600]] },
    { style: 'mordor', poly: [[1180, 1240], [1440, 1240], [1440, 1500], [1180, 1500]] },
    { style: 'dale', poly: [[1180, 760], [1330, 760], [1330, 920], [1180, 920]] },
    { style: 'harad', poly: [[850, 1600], [2001, 1600], [2001, 2001], [850, 2001]] },
    { style: 'easterling', poly: [[1400, 850], [2001, 850], [2001, 1600], [1400, 1600]] },
  ],
};
