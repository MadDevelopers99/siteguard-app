// Tyre / Nozzle direction clock selector logic (Parked Vehicle task PDF).

const TYRE_DIRECTION_OPTIONS = [
  "12 Uhr", "1 Uhr", "2 Uhr", "3 Uhr", "4 Uhr", "5 Uhr", "6 Uhr",
  "7 Uhr", "8 Uhr", "9 Uhr", "10 Uhr", "11 Uhr", "Unknown"
];

// 12 Uhr -> 0°, 3 Uhr -> 90°, 6 Uhr -> 180°, 9 Uhr -> 270°, Unknown -> null.
function angleForHour(hourLabel) {
  if (!hourLabel || hourLabel === "Unknown") return null;
  const hour = parseInt(hourLabel, 10);
  if (Number.isNaN(hour)) return null;
  return (hour % 12) * 30;
}

const VEHICLE_COLOR_OPTIONS = [
  "Black", "White", "Silver", "Grey", "Blue", "Red", "Green",
  "Yellow", "Brown", "Beige", "Orange", "Gold", "Unknown"
];

// Brand -> model list, covering the makes most commonly seen on German
// streets. "Other / Unknown" is always available as a brand and, once
// picked, is the only model offered (a driver can still note specifics in
// the free-text Driver Note field).
const VEHICLE_BRAND_MODELS = {
  "Volkswagen": ["Golf", "Polo", "Passat", "Tiguan", "Touran", "T-Roc", "T-Cross", "Arteon", "Up!", "ID.3", "ID.4", "ID.5", "Caddy", "Transporter", "Sharan"],
  "BMW": ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "6 Series", "7 Series", "8 Series", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "i3", "i4", "iX"],
  "Mercedes-Benz": ["A-Class", "B-Class", "C-Class", "E-Class", "S-Class", "CLA", "CLS", "GLA", "GLB", "GLC", "GLE", "GLS", "Vito", "Sprinter", "V-Class"],
  "Audi": ["A1", "A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q4 e-tron", "Q5", "Q7", "Q8", "TT", "e-tron"],
  "Opel": ["Corsa", "Astra", "Insignia", "Crossland", "Grandland", "Mokka", "Zafira", "Combo", "Vivaro"],
  "Ford": ["Fiesta", "Focus", "Mondeo", "Kuga", "Puma", "EcoSport", "Galaxy", "S-Max", "Transit", "Ranger"],
  "Skoda": ["Fabia", "Octavia", "Superb", "Kamiq", "Karoq", "Kodiaq", "Scala", "Enyaq"],
  "Seat": ["Ibiza", "Leon", "Arona", "Ateca", "Tarraco"],
  "Renault": ["Clio", "Megane", "Captur", "Kadjar", "Talisman", "Twingo", "Scenic", "Zoe"],
  "Peugeot": ["208", "308", "2008", "3008", "5008", "508", "Partner"],
  "Citroen": ["C1", "C3", "C4", "C5 Aircross", "Berlingo"],
  "Toyota": ["Yaris", "Corolla", "RAV4", "C-HR", "Aygo", "Camry", "Prius", "Land Cruiser", "Proace"],
  "Hyundai": ["i10", "i20", "i30", "Tucson", "Kona", "Santa Fe", "IONIQ", "IONIQ 5"],
  "Kia": ["Picanto", "Rio", "Ceed", "Sportage", "Sorento", "Niro", "EV6", "Stonic"],
  "Fiat": ["500", "Panda", "Tipo", "500X", "Doblo", "Ducato"],
  "Nissan": ["Micra", "Juke", "Qashqai", "X-Trail", "Leaf", "Navara"],
  "Mazda": ["2", "3", "6", "CX-3", "CX-5", "CX-30"],
  "Volvo": ["V40", "V60", "V90", "XC40", "XC60", "XC90"],
  "Mini": ["Cooper", "Countryman", "Clubman"],
  "Porsche": ["911", "Cayenne", "Macan", "Panamera", "Taycan"],
  "Tesla": ["Model 3", "Model S", "Model X", "Model Y"],
  "Mercedes/Sprinter Vans": ["Sprinter", "Vito"],
  "MAN": ["TGE", "TGL", "TGM", "TGX"],
  "Iveco": ["Daily", "Eurocargo"],
  "Other / Unknown": ["Other / Unknown"]
};

const VEHICLE_BRAND_OPTIONS = Object.keys(VEHICLE_BRAND_MODELS);

module.exports = {
  TYRE_DIRECTION_OPTIONS,
  angleForHour,
  VEHICLE_COLOR_OPTIONS,
  VEHICLE_BRAND_OPTIONS,
  VEHICLE_BRAND_MODELS
};
