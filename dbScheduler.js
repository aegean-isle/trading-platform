/*
Go through every currency pair in the DB.
  If any is over 5 mins old, query and add to DB
Find poloniexdata
find all documents
  for each document (currency pair)
    if last elements 'date' is more than five minutes old
      add currencies to list

DBPoloniex.deleteMany({}).then( (data) => {
  console.log(data);
});
 */


/*
 * Here we get all USDT currencies and add them to our database
 */


const schedule = require('node-schedule');
const Poloniex = require('poloniex.js');
const DBPoloniex = require('./models/PoloniexData');
// const exchangeData = require('./controllers/exchangeData');

const polo = new Poloniex();
const GRANULARITY = 86400;

// 300, 900, 1800, 7200, 14400, 86400 // 1503014400
function getTickData(currencyA, currencyB) {
  return new Promise((resolve, reject) => {
    const tickData = [];
    polo.returnChartData(currencyA, currencyB, GRANULARITY, 1000000000, 9999999999, (err, data) => {
      if (err) {
        console.log('### ERROR getting historical tick data for', (`${currencyA}_${currencyB}`));
        console.log(err);
        // throw new Error('data request messed up...')
        reject(err);
      } else {
        // console.log(tickData);
        for (let i = 0; i < data.length; i++) {
          tickData.push(data[i]);
        }
        resolve(tickData);
      }
      reject(err);
    });
  });
}

function addNewPairToDBPoloniex(pair, currencyA, currencyB) {
  return new Promise(async (resolve, reject) => {
    console.log('### Getting tick data for', pair, '...');
    let tickData;
    try {
      tickData = await getTickData(currencyA, currencyB);
      // console.log('tickData', tickData);
    } catch (e) {
      console.log(e);
      reject('### ERROR GETTING POLONIEX DATA FOR', pair);
      return;
    }

    console.log('### Recieved data for', pair, `[${tickData.length - 1}] points`);
    const bulkWriteToDB = [];
    for (let i = 0; i < tickData.length; i++) {
      const entry = {
        currencyPair: pair,
        baseCurrency: currencyA,
        tradeCurrency: currencyB,
        date: tickData[i].date,
        high: tickData[i].high,
        low: tickData[i].low,
        close: tickData[i].close,
        volume: tickData[i].volume,
        quoteVolume: tickData[i].quoteVolume,
        weightedAverage: tickData[i].weightedAverage
      };
      bulkWriteToDB.push(entry);
    }
    console.log('bulkwrite',bulkWriteToDB[0]);
    try {
      console.log(`### Adding ${bulkWriteToDB.length} new entries to the DB...`);
      await DBPoloniex.insertMany(bulkWriteToDB);
      console.log(`### SUCCESS: ${bulkWriteToDB.length} new entries for ${pair} was saved to DB`);
      resolve((`### SUCCESS: ${bulkWriteToDB.length} new entries for ${pair} was saved to DB`));
    } catch (e) {
      console.log('### ERROR: Couldn\'t save data.');
      console.log(e);
      reject(e);
    }
  });
}


/**
 * Gets the current orderbook from Poloniex.
 * @returns a promise with an array of currencyPair objects
 */
function getCurrentOrderbook() {
  return new Promise((resolve, reject) => {
    console.log('### Getting current orderbook...');
    polo.getTicker((err, data) => {
      if (err) {
        reject(err);
        return;
      }
      const ret = [];
      Object.keys(data).forEach((currencyPair) => {
        ret.push({ [currencyPair]: data[currencyPair] });
      });
      // console.log(ret);
      resolve(ret);
    });
  });
}


/**
 * See's if most recent tick is older than a certain age (GRANULARITY)
 *
 * @param {array} tickData array of all the tick data for a currency
 * @returns asdfas
 */
function checkAgeOfTickData(tick) {
  const age = Math.floor((new Date().getTime() / 1000) - tick.date);
  if (age <= GRANULARITY) {
    console.log(`### Data for ${tick.currencyPair} is up to date (${age} seconds (${Math.floor(age / 60)} minutes)`);
    return true;
  }
  console.log(`### Data for ${tick.currencyPair} is ${age} seconds (${Math.floor(age / 60)} minutes) old!`);
  return false;
}


/**
 * Updages MongoDB currency collection with missing ticks
 *
 * @param {any} tickData array of mongodb objects
 * @param {any} currencyA first currency
 * @param {any} currencyB seccond currency
 * @returns a promise
 */
function updateDoc(mostRecentTick, currencyA, currencyB) {
  return new Promise(async (resolve, reject) => {
    const startTime = mostRecentTick + GRANULARITY;
    const newData = [];
    polo.returnChartData(currencyA, currencyB, GRANULARITY, startTime, 9999999999, async (err, data) => {
      if (err) {
        console.log('### ERROR getting historical tick data for', (`${currencyA}_${currencyB}`));
        console.log(err);
      } else {
        for (let i = 0; i < data.length; i++) {
          newData.push(data[i]);
        }
      }
      // console.log(`### NEW DATA ${(currencyA + '_' + currencyB)}`, newData);
      const bulkWriteToDB = [];
      for (let i = 0; i < newData.length; i++) {
        const entry = {
          currencyPair: (`${currencyA}_${currencyB}`),
          baseCurrency: currencyA,
          tradeCurrency: currencyB,
          date: newData[i].date,
          high: newData[i].high,
          low: newData[i].low,
          close: newData[i].close,
          volume: newData[i].volume,
          quoteVolume: newData[i].quoteVolume,
          weightedAverage: newData[i].weightedAverage
        };
        bulkWriteToDB.push(entry);
      }
      try {
        console.log('### Updating entry to the DB...');
        await DBPoloniex.insertMany(bulkWriteToDB);
        console.log(`### SUCCESS: Data for ${currencyA}_${currencyB} was updated to DB`);
        resolve((`### SUCCESS: Data for ${currencyA}_${currencyB} was updated to DB`));
      } catch (e) {
        console.log('### ERROR: Couldn\'t update data.');
        console.log(e);
        reject(e);
      }
    });
  });
}

exports.dbInitializer = async function () {
  // take an orderbook snapshot
  // for pairs in snapshot but not in database, add it (this will add new currencies)
  //
  return new Promise(async (resolve, reject) => {
    if (0) {
      console.log('Clearing out database...');
      DBPoloniex.deleteMany({}).then((data) => { console.log(data); resolve(); });
    } else {
      let orderbook;
      try {
        // Get the current Poloniex orderbook
        orderbook = await getCurrentOrderbook();
        console.log('### Recieved orderbook.');
      } catch (e) {
        console.log(e);
        reject(e);
      }

      // Findf if each currency exists in our MongoDB
      const DBAddNewEntryPromises = [];
      const DBQueries = [];
      for (let i = 0; i < orderbook.length; i++) {
        const pair = Object.keys(orderbook[i])[0];
        const AB = pair.split('_'); const A = AB[0]; const B = AB[1];
        // Find the most recent document (tick) for a currency
        console.log(`### Querying DB for ${pair}...`);
        const DBQuery = DBPoloniex.find({ currencyPair: pair }).sort({ date: -1 }).limit(1).then(async (tickDataFromDB) => {
          // If currency isn't found, add it. Else, make sure it's up to date.
          if (tickDataFromDB.length !== 0) {
            console.log(`### ${pair} found in DB.`);
            if (checkAgeOfTickData(tickDataFromDB[0]) !== true) {
              // Update collection by adding missing ticks
              await updateDoc(tickDataFromDB[0].date, A, B);
            }
          // Currency pair not found in DB
          } else {
            console.log('### New pair found:', pair);
            DBAddNewEntryPromises.push(addNewPairToDBPoloniex(pair, A, B));
          }
        })
        .catch((err) => {
          console.log(err);
        });
        DBQueries.push(DBQuery);
        // console.log(tickDataFromDB);
        // console.log('### Querying most recent tick for',pair);
        // DBUpdateEntryPromises.push(tickDataFromDB);
      }

      let DBUpdateResolves;
      try {
        // console.log((await Promise.all(DBUpdateEntryPromises)));
        DBUpdateResolves = await Promise.all(DBAddNewEntryPromises);
        console.log('Resolves:', DBUpdateResolves);
        await Promise.all(DBQueries);
        resolve();
      } catch (e) {
        console.log(e);
        reject(DBUpdateResolves);
      }
    }
  });
};


exports.dbUpdater = function () {
  // Job runs at the top of every 5 minutes
  schedule.scheduleJob('*/1 * * * *', () => {
    console.log();
    getCurrentOrderbook().then((orderbook) => {
      console.log(orderbook);
      console.log(new Date(), 'DATABASE UPDATED');
    });
    // get orderbook
    // for each currency in book, create new entry with updated price

    console.log();
  });
};