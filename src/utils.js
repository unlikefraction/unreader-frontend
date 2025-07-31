// Toggle this to true/false to enable/disable debug logs
let debugging = true;

function setDebugging(val) {
    debugging = val;
}

function print(message) {
    if (debugging) {
        console.log(message);
    }
}

function printError(message) {
    if (debugging) {
        console.error(message);
    }
}
