
/** ///////////////////////////////////////////////////////////////////
 * 
 * Date functions for converting from and to the different date formats
 * used by the CCCD algorithm
 * 
 ** /////////////////////////////////////////////////////////////////*/

/// CONSTANTS
// Julian date of date 01-01-0001
var ORIGIN = 1721423
// Conversion factor from ms to days
var MS_TO_DAYS = 86400000
// Number of days between 01-01-0001 (inclusive) and 01-01-1970 (non-inclusive)
var EPOCH_DAYS = ee.Number(719163)


/// FUNCTIONS



/**
 * milliseconds since epoch (01-01-1970 ) to number of days 
 * @param {Number} ms ms since 01-01-1970)
 * @returns {ee.Number} milliseconds since epoch            
*/ 
var msToDays = function(ms){
  return ee.Number(ms).divide(MS_TO_DAYS)
}


/** 
 * Convert Date to julian days (i.e. days since 01-01-0001)
 * @param {String} str_date Date string in yyyy-mm-dd format 
 * @returns {ee.Number} Julian day            
*/
var dateToJdays = function(str_date){
   if (!str_date) {
    return('Required parameter [str_date] missing')
  }
  var date = ee.Date(str_date)

  // Convert unix time to days
  return msToDays(date.millis()).add(EPOCH_DAYS)
}


/** 
 * Convert julian day (i.e. days since 01-01-0001) to ms since 1970-01-01
 * @param {Number} jdays Julian day 
 * @returns {ee.Number} ms since 1970-01-01  
*/
var jdaysToms = function(jdays){
  var daysSinceEpoch = ee.Number(jdays).subtract(EPOCH_DAYS)
  return daysSinceEpoch.multiply(MS_TO_DAYS)
}


/** 
 * Convert julian day (i.e. days since 01-01-0001) to ee.Date
 * @param {Number} jdays Julian day 
 * @returns {ee.Date} ee.Date  
*/
var jdaysToDate = function(jdays){
  return ee.Date(jdaysToms(jdays))
}


/** 
 * Convert ms since 1970-01-01 to julian day (i.e. days since 01-01-0001)
 * @param {Number} ms ms since 1970-01-01
 * @returns {ee.Number} Julian day  
 * 
*/
var msToJdays = function(ms){
  return ee.Number(msToDays(ms)).add(EPOCH_DAYS)
}

/// Date to milliseconds
// Not required. use ee.Date.millis()


/** 
 * Convert ms since 1970-01-01 to fractional year
 * @param {Number} ms ms since 1970-01-01
 * @returns {ee.Number} Fractional year  
*/
var msToFrac = function(ms){
  var year = (ee.Date(ms).get('year')) 
  var frac = (ee.Date(ms).getFraction('year'))  
  return year.add(frac)
}

/** 
 * Convert fractional time to ms since 1970-01-01. DOES NOT ACCOUNT FOR LEAP YEARS
 * @param {Number}  frac  Fractional year
 * @returns {ee.Number} ms since 1970-01-01
*/
var fracToms = function(frac){
  var fyear = ee.Number(frac)
  var year = fyear.floor()
  var d = fyear.subtract(year).multiply(365)
  var day_one = ee.Date.fromYMD(year, 1, 1)
  return day_one.advance(d, 'day').millis()
  
}


/** 
 * Convert fractional time ee.Date DOES NOT ACCOUNT FOR LEAP YEARS
 * @param {Number} frac Fractional year
 * @returns {ee.Date}  date object
*/
var fracToDate = function(frac){
  var ms = fracToms(frac)
  return msToDate(ms)
}

/**
 * Convert ms to ee.Date
 * @param {number} ms jdays as milleconds
 * @returns {ee.Date} ee.Date
*/
var msToDate = function(ms){return jdaysToDate(msToJdays(ms))}


/**
 * Convert between any two date formats
 * 
 * @param {Dictionary}  options      parameter dictionary
 * @key   {Number}      inputFormat  date format according to ee ccdc function or 3 for string
 * @key   {Object}      inputDate    date as Number or String format on inputFormat
 * @key   {Number}      outputFormat output date format according to ee ccdc function or 4 for ee.Date
 * @returns {Object}    output       reformatted date
*/
var convertDate = function(options) {
  var inputFormat = (options && options.inputFormat) || 0
  var inputDate = (options && options.inputDate) || null
  var outputFormat = (options && options.outputFormat) || 0

  if (!inputDate) {
    return('Required parameter [inputDate] missing')
  }
  
  // First convert to millis
  if (inputFormat === 0) {
    var milli = jdaysToms(inputDate)
  } else if (inputFormat == 1) {
    var milli = fracToms(inputDate)
  } else if (inputFormat == 2) {
    var milli = inputDate
  } else if (inputFormat == 3) {
    var milli = jdaysToms(dateToJdays(inputDate))
  }

  // Now convert to output format
  if (outputFormat === 0) {
    var output = msToJdays(milli)
  } else if (outputFormat == 1) {
    var output = msToFrac(milli)
  } else if (outputFormat == 2) {
    var output = milli
  } else if (outputFormat == 4) {
    var output = jdaysToDate(msToJdays(milli))
  }
  
  return output
}
// nvertDate = function(inputFormat, inputDate, outputFormat) {
//   inputFormat = inputFormat || 0
//   inputDate =  inputDate || null
//   outputFormat = outputFormat || 0

//   if (!inputDate) {
//     return('Required parameter [inputDate] missing')
//   }
  
//   // First convert to millis
//   if (inputFormat === 0) {
//     var milli = jdaysToms(inputDate)
//   } else if (inputFormat == 1) {
//     var milli = fracToms(inputDate)
//   } else if (inputFormat == 2) {
//     var milli = inputDate
//   } else if (inputFormat == 3) {
//     var milli = jdaysToms(dateToJdays(inputDate))
//   }

//   // Now convert to output format
//   if (outputFormat === 0) {
//     var output = msToJdays(milli)
//   } else if (outputFormat == 1) {
//     var output = msToFrac(milli)
//   } else if (outputFormat == 2) {
//     var output = milli
//   } else if (outputFormat == 4) {
//     var output = jdaysToDate(msToJdays(milli))
//   }
  
//   return output
// }


exports = {
  msToDays: msToDays,
  dateToJdays: dateToJdays,
  jdaysToms: jdaysToms,
  jdaysToDate: jdaysToDate,
  msToJdays: msToJdays,
  msToFrac: msToFrac,
  msToDate: msToDate,
  fracToms: fracToms,
  convertDate: convertDate
}

// print(convertDate({inputFormat: 3, inputDate: '2019-10-01', outputFormat: 2}))



// print(msToDays(86400000))  //86400000 ms = 1 day
// print(dateToJdays('0001-01-01')) // 1
// print(dateToJdays('2019-10-01')) // 737333
// print(jdaysToms(737333)) // 1569888000000
// print(ee.Date(1569888000000)) // 2019-10-01
// print(jdaysToDate(737333)) // 2019-10-01
// print(msToJdays(1569888000000)) // 737333
// print(msToFrac(1569888000000)) // 2019.7479452054795
// print(fracToms(2019.7479452054795)) // 1569888000000 
// print(ee.Date(1569888000000)) // 2019-10-01
// 737333, 2019.7479452054795, 1569888000000
// print(fracToDate(2019.7479452054795))