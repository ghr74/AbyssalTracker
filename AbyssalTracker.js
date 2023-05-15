function calcTimeUsed(timeLeft) {
  // @returns (20 minutes - timeLeft) in seconds
  let [minutes, seconds] = timeLeft.split(":")
  let timeMaxDate = new Date(1970,0,1,0,20,0); // 20 minutes max
  let timeLeftDate = new Date(1970,0,1,0,parseInt(minutes, 10), parseInt(seconds, 10));
  return (timeMaxDate - timeLeftDate) / 1000
}

function rsplit(src, sep, maxsplit) {
    let split = src.split(sep);
    return maxsplit ? [ split.slice(0, -maxsplit).join(sep) ].concat(split.slice(-maxsplit)) : split;
}

function calcLootBreakdown(rawLoot) {
  // @returns Map of lootName (str) : lootAmount (int)
  // break string by newlines
  // line by line either insert new key or add amount to existing key
  let lines = rawLoot.split(/\r?\n/)
  let lootBreakdown = new Map()
  lines.forEach(function(line){
    let [,name,amount] = line.match(/^([\S ]*)\t([\d,'\.]*)$/)
    amount = amount ? parseInt(amount, 10) : 1
    if (lootBreakdown.has(name)) {
      lootBreakdown.set(name, lootBreakdown.get(name)+amount)
    }
    else {
      lootBreakdown.set(name, amount)
    }
  });
  let entries = [...lootBreakdown.entries()]
  return lootBreakdown
}

/**
 * Overflows the loot split into the header format.
 *
 * @param loot The loot to split.
 * @param header The loot header to split into.
 * @return Column of header width with the loot split.
 * @customfunction
 */
function LOOTSPLIT(loot, lootHeader2D) {
  let lootHeader = lootHeader2D[0]
  let lootBreakdown = calcLootBreakdown(loot)
  let lootValues = new Array(lootHeader.length)
  lootBreakdown.forEach(function(lootAmount, lootName) {
    if (lootHeader.includes(lootName)) {
      lootValues[lootHeader.indexOf(lootName)] = lootAmount
    }
//    else {
//      //maybe handle appending missing loot to bottom of 'Raw Prices' later.
//    }
  })
  return [lootValues]
}

function debug_LOOTSPLIT() {
  let ss=SpreadsheetApp.getActiveSpreadsheet()
  let formSheet = ss.getSheetByName('Form Responses 1')
  let dataSheet = ss.getSheetByName('Run Data')
  let loot = formSheet.getRange("C4").getValue()
  let lootHeader2D = dataSheet.getRange("R1:1").getValues()
  LOOTSPLIT(loot, lootHeader2D)
}

function processRow(sourceRow, rowNumber, formSheet, dataSheet) {
  // input headers (Col, Col#): A1 Timestamp,	B2 Time Left,	C3 Loot,	D4 Cans,	E5 Tier,	F6 Mode, G7 Ship Type, H8 Abyss Type, I9 DPS
  // output headers(Col, Col#): A1 Timestamp,   B2 Time Left,   C3 Time Used, D4 Seconds Used, E5 DPS, F6 Cans, G7 Tier, H8 Mode, I9 Ship Type, J10 Abyss Type, K11 SiteHP, L12 Initial Loot Value, M13 Current Loot Value, N14 Loot Value Delta , O15 Initial Profit, P16 Current Profit, Q17 Profit Delta, R18-X [loot amounts split up into columns]
  
  // Get Form Response Data for rowNumber
  let responseValues = formSheet.getRange(sourceRow, 1, 1, 9).getValues()[0] // rowNumber's values (col 1-7)
  // 2. Setformula for current Loot Value Data Range (slot 12)
  let currentLootValueDataRange = dataSheet.getRange(rowNumber, 13)
  // 3. Copyvalue for initial Loot Value Data Range (slot 11)
  let initialLootValueDataRange = dataSheet.getRange(rowNumber, 12)
  // 2. Setformula for current Profit Data Range (slot 14)
  let currentProfitDataRange = dataSheet.getRange(rowNumber, 16)
  // 3. Copyvalue for initial Profit Data Range (slot 13)
  let initialProfitDataRange = dataSheet.getRange(rowNumber, 15)
  
  let valueRange = dataSheet.getRange(rowNumber, 1, 1, 10)
  let formulaRange = dataSheet.getRange(rowNumber, 11, 1, 7)
  let durationFormatRange = dataSheet.getRange(rowNumber, 2, 1, 2)
  let iskFormatRange = dataSheet.getRange(rowNumber, 12, 1, 6)
  
  //Processing
  //Step 1: fill Static Data Range A-G (7)
  let result = []
  let timeUsedSeconds = calcTimeUsed(responseValues[1])
  result.push(responseValues[0]) // 1 Timestamp
  result.push("0:"+responseValues[1]) // 2 Time Left
  result.push("0:"+durationToTime(timeUsedSeconds)) // 3 Time Used
  result.push(timeUsedSeconds) // 4 Seconds Used
  result.push(responseValues[8]) // 5 DPS
  result.push(responseValues[3]) // 6 Cans
  result.push(responseValues[4]) // 7 Tier
  result.push(responseValues[5]) // 8 Mode
  result.push(responseValues[6]) // 9 Ship Type
  result.push(responseValues[7]) // 10 Abyss Type
  
  valueRange.setValues([result])
  
  let formulas = []
  formulas.push(`=(D${rowNumber}-'Hidden Stats'!A8)*E${rowNumber}`) // 11 SiteHP
  formulas.push("") // 12 Initial Loot Value (replace with recursive formula maybe)
//  formulas.push(`=IF(L${rowNumber}>0,L${rowNumber},M${rowNumber})`) // 12 Initial Loot Value recursive - using iterative calculation breaks FILTER stuff so we can't do this. maybe consider using a second sheet as database? Polling rate makes this option kinda bad too, may be a consideration though
  // I'm afraid iterative also breaks pricing mean calculation, else it could be worth a consideration
  formulas.push("=SUMPRODUCT(ArrayFormula(IFERROR(VLOOKUP($R$1:$1,'Price Data'!$A:$B,2,false)))*$R"+rowNumber+":"+rowNumber+")") // 13 Current Loot Value
  formulas.push(`=M${rowNumber}-L${rowNumber}`) // 14 Loot Value Delta
  formulas.push("") // 15 Initial Profit (replace with recursive formula maybe)
//  formulas.push(`=IF(O${rowNumber}>0,O${rowNumber},P${rowNumber})`) // 15 Initial Profit recursive
  formulas.push("=M"+rowNumber+" - INDEX('Price Data'!$A:$B, MATCH(\""+tierToFilamentPrefix(responseValues[4])+" "+responseValues[7]+" Filament\",'Price Data'!$A:$A, 0),2) * " + shipTypeToFilamentAmount(responseValues[6])) // 16 Current Profit
  formulas.push(`=P${rowNumber}-O${rowNumber}`) // 17 Profit Delta
  formulaRange.setFormulas([formulas])
  
  let lootHeader = dataSheet.getRange("R1:1").getValues()
  let lootArrayRange = dataSheet.getRange(rowNumber, 18, 1, lootHeader[0].length)
  lootArrayRange.setValues(LOOTSPLIT(formSheet.getRange(sourceRow,3).getValue(), lootHeader))
  
  SpreadsheetApp.flush()
  
//  //Step 6: copy value for historic Loot Value equal to Value from Step 5 (Col 8)
  //I really would have preferred to go with the recursive version but oh well, hope this doesn't break due to lag again, if it does I'll probably go recursive and use a 2nd sheet import for filtering and research
  initialLootValueDataRange.setValue(currentLootValueDataRange.getValue())
  initialProfitDataRange.setValue(currentProfitDataRange.getValue())
  
  
  
  //Apply Formats
  let durationFormat = "m:ss"
  let iskFormat = "[$Ƶ ]#,##0"
  durationFormatRange.setNumberFormat(durationFormat)
  iskFormatRange.setNumberFormat(iskFormat)
}

function testRow() {
  let ss=SpreadsheetApp.getActiveSpreadsheet()
  let formSheet = ss.getSheetByName('Form Responses 1')
  let dataSheet = ss.getSheetByName('Run Data')
  let targetRow = 4
  processRow(targetRow, targetRow, formSheet, dataSheet)
}

function onFormSubmit() {
  let ss=SpreadsheetApp.getActiveSpreadsheet()
  let formSheet = ss.getSheetByName('Form Responses 1')
  let dataSheet = ss.getSheetByName('Run Data')
  let formLr = formSheet.getLastRow()
  let dataLr = dataSheet.getLastRow()+1
  if (formLr === dataLr) {
    processRow(formLr, dataLr, formSheet, dataSheet)
  }
  //fill a-g (7)
  //setformula slot 9
  //copyvalue 9 to 8
  //get contents of 10-dataLcNum, prepare entry of lootBreakdown
}

function durationToTime(duration) {
  let minutes = ~~((duration % 3600) / 60);
  let seconds = ~~duration % 60;
  
  return "" + minutes + ":" + (seconds < 10 ? "0" : "") + seconds
}

function tierToFilamentPrefix(tier) {
  switch(tier) {
    case 1:
      return "Calm"
      break;
    case 2:
      return "Agitated"
      break;
    case 3:
      return "Fierce"
      break;
    case 4:
      return "Raging"
      break;
    case 5:
      return "Chaotic"
      break;
    default:
      return "ERROR"
  }
}

function shipTypeToFilamentAmount(shipType) {
  //Switch in case of future changes
  switch(shipType) {
    case "Frigate":
      return 3
      break;
    case "Cruiser":
      return 1
      break;
    default:
      return "ERROR"
  }
}
