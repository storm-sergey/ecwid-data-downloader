'use strict';

const fs = require('fs');
const fetch = require('node-fetch');
const prompt = require('prompt-sync')();

const REQ_DELAY_MS = 1000;
const BATCH_DELAY_MS = 4000;
const BATCH_TIME_LIMIT_MS = 300000;
const API = 'https://app.ecwid.com/api/v3/';
const STORE_ID = process.env.ECWID_STORE_ID;
const ACCESS_TOKEN = process.env.ECWID_ACCESS_TOKEN;
const REQUESTED_DATA = prompt("Enter an ecwid api method: ");

main();

async function main() {
    console.log(`The amount of requested data is ${await getTotal()} items.
        Downloading... Please wait.`);
    saveLikeAFile(await funcWithTimeLog(getEcwidData));
}

async function getTotal() {
    return await req("GET", REQUESTED_DATA, "limit=1").then(res => res.total);
}

async function req(method, apiMeth, params = undefined, body = undefined) {
    await delay(REQ_DELAY_MS);
    const url = await getUrl(apiMeth, params);
    const options = await getOptions(method, body);
    return await fetch(url, options)
        .then(res => res.json())
        .catch(err => console.log(err));
}

async function getUrl(apiMeth, params) {
    return `${API}${STORE_ID}/${apiMeth}?`
        + (params ? `${params}&` : '')
        + `token=${ACCESS_TOKEN}`;
}

async function getOptions(method, body) {
    const headers = await getHeaders();
    return {
        method,
        cache: "no-cache",
        headers,
        referrerPolicy: "no-referrer",
        body,
    };
}

async function getHeaders() {
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
        "Accept-Encoding": "gzip",
    };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function saveLikeAFile(data, num = '') {
    const _fileName = REQUESTED_DATA + num + ".json";
    fs.writeFile(_fileName,
        data,
        err => {
            if (err) return console.log(err);
            console.log(`The ${REQUESTED_DATA} saved to the '${_fileName}' file!`);
        }
    );
}

async function funcWithTimeLog(func) {
    const start = Date.now();
    const result = await func();
    const end = Date.now() - start;
    console.log(`Total downloading time: ${end / 60000} minutes`);
    return result;
}

async function getEcwidData() {
    const ecwidData = [];
    const offset = await getOffset();

    while (offset.num >= 0) {
        let batchReqBody = await getBatchReqBody(offset);
        let ticket = await getTicket(batchReqBody);
        ecwidData.push(await getDataBatch(ticket));
    }
    return JSON.stringify(ecwidData);
}

async function getOffset() {
    return {
        num: Math.ceil(await getTotal() / 100) * 100
    };
}

async function getBatchReqBody(offset) {
    const leftoverItems = await getLeftoverThousands(offset);
    const jsonBatchReq = [];

    while (offset.num >= leftoverItems) {
        jsonBatchReq.push(await getJsonReqBody(offset));
        offset.num -= 100;
    }
    return JSON.stringify(jsonBatchReq);
}

async function getLeftoverThousands(offset) {
    return await getOnlyThousands(offset.num)
        .then(leftoverThousands => leftoverThousands < 0 ? 0 : leftoverThousands);
}

async function getOnlyThousands(num) {
    return (Math.ceil(num / 1000) - 1) * 1000;
}

async function getJsonReqBody(offset) {
    return {
        id: STORE_ID,
        path: `/${REQUESTED_DATA}?offset=${offset.num}`,
        method: "GET",
        body: '',
    };
}

async function getTicket(body) {
    return await req("POST", "batch", undefined, body).then(res => res.ticket);
}

async function getDataBatch(ticket) {
    let batchRes = await getBatchRes(ticket);
    let start = Date.now();

    while (batchRes.status != "COMPLETED") {
        checkTimeLimit(start)
        await delay(BATCH_DELAY_MS);
        batchRes = await getBatchRes(ticket);
    }
    return batchRes;
}

function checkTimeLimit(start) {
    if (Date.now() > (start + BATCH_TIME_LIMIT_MS)) {
        throw new Error("waiting time exceeded");
    }
}

async function getBatchRes(ticket) {
    return await req("GET", "batch", "ticket=" + ticket);
}
