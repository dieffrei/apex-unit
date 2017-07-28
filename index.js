const jsforce = require('jsforce');
const _ = require('underscore');
const sleep = require('sleep');
const fs = require('fs');
const kale = require('kale');
const restler = require('restler');
const parseArgs = require('minimist');

console.dir(parseArgs(process.argv));

var args = parseArgs(process.argv);

var codacyUser = args['codacy-user-name'];
var repoName = args['repo-name'];
var commitSha1 = args['commit-sha1'];
var codacyProjectToken = args['codacy-project-token'];
var userName = args['user-name'];
var password = args['password'];
var salesforceUrl = args['salesforce-url'];

const conn = new jsforce.Connection({
    loginUrl: salesforceUrl
});

const getConnection = async() => {
//    return await conn.login("dieffrei.quadros@eu-cosan.com.qa",
//        'Tobi86!@IXnHqS6Geypr502FEDt3nJGee');
    return await conn.login(userName, password);
};

const findAllTestClassesIds = async() => {
    return await conn.tooling.sobject('ApexClass')
        .find({}, "Id, Name, SymbolTable")
        .execute();
};

const queryTestExecutionStatus = async(testJobId) => {
    const data = await conn.query('select Id, Status, ApexClassId from ApexTestQueueItem where ParentJobId = \'' + testJobId + '\'')
    var isCompleted = true;
    _.each(data.records, function (row) {
        if (row.Status === 'Queued' || row.Status === 'Processing') {
            isCompleted = false;
        }
    });
    return isCompleted;
};

/* CODACY CODE COVERAGE FORMAT
 {
 "total": 23,
 "fileReports": [
 {
 "filename": "src/Codacy/Coverage/Parser/CloverParser.php",
 "total": 54,
 "coverage": {
 "3": 3,
 "7": 1
 }
 }
 ]
 }
 */
function toCodacyFormat(salesforceCodeCoverageResult, wideCodeCoverage) {

    var codacyFormatData = {
        total: wideCodeCoverage.PercentCovered,
        fileReports: []
    };

    _.each(salesforceCodeCoverageResult, (classCoverage) => {

        var codacyFormatDataItem = {
            filename: classCoverage.ApexClassOrTrigger.Name,
            total: classCoverage.NumLinesCovered / classCoverage.NumLinesUncovered,
            coverage: {}
        };

        if (classCoverage.Coverage != null) {
            _.each(classCoverage.Coverage.coveredLines, (line) => {
                codacyFormatDataItem.coverage[line] = 1;
            })
        }

        codacyFormatData.fileReports.push(codacyFormatDataItem);

    });

    return codacyFormatData;
}

const calculateCodeCoverage = async() => {

    await getConnection();

    const testClasses = await findAllTestClassesIds();
    const testClassIds = _.pluck(testClasses, 'Id');
    console.log('Test classes ' + testClassIds);

    const jobId = await conn.tooling.runTestsAsynchronous(testClassIds.slice(0, 1));
    console.log('Job Id [' + jobId + ']');

    while (!await queryTestExecutionStatus(jobId)) {
        console.log('Testing is running');
        sleep.sleep(1);
    }

    const codeCoverageResults = await conn.tooling.sobject('ApexCodeCoverageAggregate')
        .find({}, 'Id, ApexClassOrTrigger.Name, ApexClassOrTriggerId, ' +
            'NumLinesCovered, NumLinesUncovered, Coverage');

    const wideCodeCoverage = await conn.tooling.sobject('ApexOrgWideCoverage').find({});
    console.log(wideCodeCoverage[0]);

    const json = toCodacyFormat(codeCoverageResults, wideCodeCoverage[0]);

    rest.post("https://api.codacy.com/2.0/"
        + codacyUser + "/" + repoName
        + "/commit/" + commitSha1 + "/coverage/apex", {
        headers: {
            project_token: codacyProjectToken
        },
        data: json
    }).on('complete', function (data, response) {
        console.log(data, response);
    });

};

calculateCodeCoverage();