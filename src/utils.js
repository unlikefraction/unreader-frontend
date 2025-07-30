const debuggingVal = false

function print(message, debugging=debuggingVal) {
    if (debugging) {
        console.log(message);
    }
}

function printError(message, debugging=debuggingVal) {
    if (debugging) {
        console.error(message);
    }
}