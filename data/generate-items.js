// Generates a realistic catalog of 100+ construction-site safety & signage items.
// Run once to produce data/items.json (already committed, but regeneratable).

const categories = [
  {
    name: "Mobile Fencing & Barriers",
    prefix: "FEN",
    items: [
      ["Mobile Site Fence Panel 3.5m x 2m (Galvanized)", 89.0],
      ["Mobile Site Fence Panel 2.0m x 2m (Galvanized)", 62.0],
      ["Heavy-Duty Fence Foot / Concrete Base Block", 24.5],
      ["Fence Panel Clamp Set (2 pcs)", 6.9],
      ["Windscreen / Privacy Mesh for Fence Panel", 34.0],
      ["Pedestrian Barrier 2m (Steel, Interlocking)", 55.0],
      ["Crowd Control Barrier 2.5m", 68.0],
      ["Plastic Water-Fillable Barrier 1.2m", 45.0],
      ["Plastic Water-Fillable Barrier 2m", 72.0],
      ["Debris Safety Net for Scaffolding (10m roll)", 58.0],
      ["Gate Panel for Mobile Fence (Lockable)", 110.0],
      ["Anti-Climb Fence Panel 2.3m", 96.0]
    ]
  },
  {
    name: "Traffic & Road Barriers",
    prefix: "TRB",
    items: [
      ["Traffic Barrier Board (Bake) 1m Red/White", 32.0],
      ["Traffic Barrier Board (Bake) 2m Red/White", 49.0],
      ["Folding Traffic Barrier A-Frame", 39.0],
      ["Guardrail Section 4m (Steel, Road-Grade)", 145.0],
      ["Guardrail End Terminal", 78.0],
      ["Concrete Jersey Barrier 2m", 210.0],
      ["Plastic Jersey Barrier 1.5m (Fillable)", 95.0],
      ["Road Closure Barrier Gate 3m", 165.0],
      ["Temporary Speed Bump 50cm Module", 42.0],
      ["Speed Bump End Cap (Pair)", 12.0],
      ["Reflective Traffic Cone 50cm", 8.5],
      ["Reflective Traffic Cone 75cm", 12.9],
      ["Traffic Cone Sand Weight / Base", 6.0],
      ["Delineator Post 1m with Reflective Bands", 14.5],
      ["Delineator Post Base (Rubber)", 9.0]
    ]
  },
  {
    name: "Warning & Regulatory Signboards",
    prefix: "SGN",
    items: [
      ["Signboard 'Baustelle' (Construction Site) 60x60cm", 28.0],
      ["Signboard 'Achtung Baustelle' (Warning) 90x60cm", 36.0],
      ["Signboard 'Durchfahrt Verboten' (No Entry) 60x60cm", 26.0],
      ["Signboard 'Umleitung' (Diversion) 60x30cm", 22.0],
      ["Signboard 'Gefahr' (Danger) 40x40cm", 19.0],
      ["Signboard 'Schutzhelm Tragen' (Hard Hat Required) 30x30cm", 15.0],
      ["Signboard 'Unbefugten Zutritt Verboten' (No Trespassing)", 24.0],
      ["Signboard 'Ausfahrt Baustelle' (Site Exit) 60x30cm", 23.0],
      ["Signboard 'Vorsicht Baustellenverkehr' (Site Traffic Caution)", 27.0],
      ["Signboard 'Achtung Stufe' (Mind the Step) 30x30cm", 14.0],
      ["Signboard 'Rutschgefahr' (Slip Hazard) 30x30cm", 14.0],
      ["Signboard 'Absperrung' (Cordoned Area) 60x40cm", 21.0],
      ["Directional Arrow Sign Board 40x20cm", 12.5],
      ["Custom Printed Signboard (Client Logo/Text) A2", 45.0],
      ["Custom Printed Signboard (Client Logo/Text) A1", 62.0],
      ["Site Information Board (Bauschild) 200x150cm", 320.0],
      ["Site Information Board (Bauschild) 150x100cm", 240.0],
      ["Emergency Assembly Point Sign", 18.0],
      ["Fire Extinguisher Location Sign", 12.0],
      ["First Aid Point Sign", 12.0]
    ]
  },
  {
    name: "Lighting & Signals",
    prefix: "LGT",
    items: [
      ["Solar Warning Beacon (Amber Flash)", 34.0],
      ["Battery Warning Lamp (Red, Continuous)", 22.0],
      ["Rechargeable LED Barrier Light", 29.0],
      ["Site Floodlight Tower (Mobile, 2x LED 500W)", 480.0],
      ["Portable Site Light Mast 3m", 260.0],
      ["Traffic Signal Head (Temporary, Solar)", 610.0],
      ["Flashing Arrow Board (Trailer-Mounted)", 890.0],
      ["Reflective Warning Strip Roll (5m, Red/White)", 18.0],
      ["Reflective Warning Strip Roll (5m, Yellow/Black)", 18.0]
    ]
  },
  {
    name: "Tapes, Nets & Ballast",
    prefix: "TPE",
    items: [
      ["Barrier Tape Red/White 500m Roll", 14.0],
      ["Barrier Tape Yellow/Black 500m Roll", 14.0],
      ["Barrier Chain Yellow/Black (Plastic) 25m", 32.0],
      ["Barrier Post with Chain Hook (Portable)", 27.0],
      ["Debris Chute Section 1m", 58.0],
      ["Debris Chute Funnel Top", 95.0],
      ["Ballast/Sandbag for Barrier Weighting", 5.5],
      ["Concrete Ballast Block 25kg", 19.0],
      ["Concrete Ballast Block 40kg", 29.0],
      ["Tarpaulin Cover 4x6m (Site Material Protection)", 48.0],
      ["Tarpaulin Cover 6x8m", 76.0]
    ]
  },
  {
    name: "Gates & Access Control",
    prefix: "ACC",
    items: [
      ["Pedestrian Turnstile Gate (Manual)", 320.0],
      ["Vehicle Access Gate 4m (Sliding)", 780.0],
      ["Site Entrance Barrier Arm (Manual)", 260.0],
      ["Site Entrance Barrier Arm (Motorized)", 890.0],
      ["Wheel Wash / Mud Grid Panel", 410.0],
      ["Site Cabin Step Rail Kit", 145.0],
      ["Lockable Site Access Gate 2m", 195.0]
    ]
  },
  {
    name: "Site Furniture & Misc",
    prefix: "MSC",
    items: [
      ["Site Waste Skip Barrier Surround", 175.0],
      ["Bike/Ped Diversion Ramp (Rubber)", 88.0],
      ["Cable Protector Ramp 1m (3-Channel)", 62.0],
      ["Cable Protector Ramp 1m (5-Channel)", 92.0],
      ["Site Notice Board (Lockable, Glass Front)", 210.0],
      ["Visitor Sign-In Post with Sign Holder", 65.0],
      ["Mobile Wash Station Barrier Screen", 130.0],
      ["Scaffold Tower Guard Rail Kit", 155.0],
      ["Site Perimeter Warning Light Set (10 units)", 220.0],
      ["Anti-Trip Cable Cover 1.5m", 40.0],
      ["Site Rest Bench (Weatherproof)", 145.0],
      ["Smoking Shelter Barrier Screen", 190.0],
      ["Site Flagpole with Warning Flag", 55.0],
      ["Muster Point Shelter Cover", 260.0],
      ["Portable Handwash Station Screen", 110.0]
    ]
  },
  {
    name: "PPE & Compliance Boards",
    prefix: "PPE",
    items: [
      ["PPE Requirement Board (Helmet/Vest/Boots/Glasses)", 42.0],
      ["Site Induction Notice Board", 58.0],
      ["Emergency Contact Board (Customizable)", 46.0],
      ["Environmental Compliance Sign Set (5 boards)", 95.0],
      ["Noise Level Warning Sign", 16.0],
      ["Dust Hazard Warning Sign", 16.0],
      ["No Smoking Site Sign", 13.0],
      ["Site Opening Hours Board", 24.0],
      ["Weight Limit Sign (Vehicle Access)", 22.0],
      ["Height Restriction Sign (Vehicle Access)", 22.0],
      ["Site Map / Layout Display Board", 165.0],
      ["Considerate Constructors Notice Board", 60.0],
      ["Site Safety Statistics Board (Days Since Incident)", 78.0],
      ["Underground Services Warning Sign", 20.0],
      ["Overhead Cable Warning Sign", 20.0],
      ["Crane Operation Zone Warning Sign", 24.0],
      ["Excavation Hazard Warning Sign", 20.0]
    ]
  }
];

const items = [];
let counter = 1;
for (const cat of categories) {
  for (const [name, price] of cat.items) {
    items.push({
      sku: `${cat.prefix}-${String(counter).padStart(4, "0")}`,
      name,
      category: cat.name,
      price,
      unit: "piece",
      description: `${name} — suitable for construction site perimeter protection, signage, and traffic control. Rental and purchase available.`
    });
    counter++;
  }
}

module.exports = items;

if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  fs.writeFileSync(
    path.join(__dirname, "items.json"),
    JSON.stringify(items, null, 2)
  );
  console.log(`Generated ${items.length} items -> data/items.json`);
}
