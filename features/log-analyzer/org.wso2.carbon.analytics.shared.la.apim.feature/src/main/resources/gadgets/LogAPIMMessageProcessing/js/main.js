/*
 * Copyright (c) 2016, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

var gatewayPort = location.port - 9443 + 8243; //Calculate the port offset based gateway port.
var serverUrl = "https://" + location.hostname + ":" + gatewayPort + "/LogAnalyzerRestApi/1.0";
var client = new AnalyticsClient().init(null, null, serverUrl);
var timeFrom = gadgetUtil.timeFrom();
var timeTo = gadgetUtil.timeTo();
var timeUnit = null;
var gadgetPropertyName = "APIM_MESSAGE_PROCESSING";
var receivedData = [];
var receivedOtherData = [];
var mockData = [];
var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
var receivedDataIdMap = new Map();
var legendMap = new Map();
var timeFrame = "";
var TOPIC_SUB_DATE_RANGE = "subscriber";
var TOPIC_PUB_CONTENT = "publisher";
var totalRecordCount = 0;
var tableName = "";
var canvasDiv = "#canvas";
var legendDiv = "#legend";
var legendTitleDiv = "#legendTitle";
var errorDiv = "#errorDiv";
var gadgetData;
var globalPage = 1;
var chartColorScale = ["#1abc9c", "#3498db", "#9b59b6", "#f1c40f", "#e67e22", "#e74c3c", "#2c3e50", "#2ecc71", "#F16272"];

function initialize() {
    gadgetData = gadgetUtil.getChart(gadgetPropertyName);
    receivedDataIdMap.clear();
    legendMap.clear();
    receivedData.length = 0;
    receivedOtherData.length = 0;
    mockData.length = 0;
    globalPage = 1;
    var newFrom = new Date(timeFrom);
    var newTo = new Date(timeTo);
    var diffDays = daysBetween(new Date(timeFrom), new Date(timeTo));
    if (diffDays > 90) {
        timeFrame = "MONTHLY";
        while (!(newFrom.getTime() >= newTo.getTime())) {
            mockData.push([months[newFrom.getMonth()] + " - " + newFrom.getFullYear(), 0, "NoEntries", 0]);
            newFrom.setMonth(newFrom.getMonth() + 1);
        }
    } else if (diffDays > 30) {
        timeFrame = "WEEKLY";
        var weekNo = 0;
        var loopCount = Math.ceil((timeTo - timeFrom) / (86400000 * 7)); // One day time in milliseconds
        for (var i = 0; i < loopCount; i++) {
            var firstDayOfMonth = new Date(newFrom);
            firstDayOfMonth.setDate(1);
            weekNo = (moment(newFrom).week()) - moment(firstDayOfMonth.getTime()).week() + 1;
            mockData.push(["W" + (weekNo == 0 ? 1 : weekNo) + " - " + months[newFrom.getMonth()] + " - " + newFrom.getFullYear(), 0, "NoEntries", 0]);
            newFrom.setDate(newFrom.getDate() + 7);
            if (newFrom.getMonth() != firstDayOfMonth.getMonth()) {
                mockData.push(["W" + (1) + " - " + months[newFrom.getMonth()] + " - " + newFrom.getFullYear(), 0, "NoEntries", 0]);
            }
        }
    } else {
        timeFrame = "DAILY";
        while (!(newFrom.getTime() >= newTo.getTime())) {
            mockData.push([newFrom.toDateString(), 0, "NoEntries", 0]);
            newFrom.setHours(newFrom.getHours() + 24);
        }
    }
    tableName = "LOGANALYZER_" + gadgetData.name + "_" + timeFrame;

    var query = "_timestamp: [" + timeFrom + " TO " + timeTo + "]";
    var sorting = [
        {
            field: gadgetData.orderedField,
            sortType: "DESC", // This can be ASC, DESC
            reversed: "false" //optional
        }
    ];
    var queryInfo = queryBuilder(tableName, query, 0, 1000, sorting);

    client.searchCount(queryInfo, function (d) {
        if (d["status"] === "success") {
            totalRecordCount = d["message"];
            if (totalRecordCount > 0) {
                fetch(0, 10);//Initial fetching cycle
            } else {
                $(canvasDiv).empty();
                $(legendDiv).empty();
                $(legendTitleDiv).empty();
                $(errorDiv).html(gadgetUtil.getEmptyRecordsText());
            }
        }
    }, function (error) {
        console.log(error);
        error.message = "Internal server error while data indexing.";
        onError(error);
    });
}

$(document).ready(function () {
    initialize();
});

function fetch(start, count) {
    receivedData.length = 0;
    receivedOtherData.length = 0;
    var query = "_timestamp: [" + timeFrom + " TO " + timeTo + "]";
    var sorting = [
        {
            field: gadgetData.orderedField,
            sortType: "DESC", // This can be ASC, DESC
            reversed: "false" //optional
        }
    ];
    var queryInfo = queryBuilder(tableName, query, start, count, sorting);
    client.search(queryInfo, function (d) {
        if (d["status"] === "success") {
            receivedData = JSON.parse(d["message"]);
            if (receivedData.length > 0 && (start + count) >= totalRecordCount) {
                drawErrorChart();
            } else if (receivedData.length > 0 && (start + count) < totalRecordCount) {
                queryInfo = queryBuilder(tableName, query, (start + count), totalRecordCount, sorting);
                client.search(queryInfo, function (d) {
                    if (d["status"] === "success") {
                        receivedOtherData = JSON.parse(d["message"]);
                        drawErrorChart();
                    }
                }, function (error) {
                    console.log(error);
                    error.message = "Internal server error while data indexing.";
                    onError(error);
                });
            } else {
                $(canvasDiv).empty();
                $(legendDiv).empty();
                $(legendTitleDiv).empty();
                $(canvasDiv).html(gadgetUtil.getEmptyRecordsText());
            }
        }
    }, function (error) {
        console.log(error);
        error.message = "Internal server error while data indexing.";
        onError(error);
    });
}

function drawErrorChart() {
    try {
        gadgetData.chartConfig.colorScale.length = 0;
        gadgetData.chartConfig.colorDomain.length = 0;
        $(canvasDiv).empty();
        $(legendDiv).empty();
        $(legendTitleDiv).empty();
        $(errorDiv).empty();
        legendMap.clear();
        var totalPages = Math.ceil(totalRecordCount / 10.0);
        var options = {
            currentPage: globalPage,
            totalPages: totalPages,
            size: "normal",
            alignment: "center",
            onPageClicked: onPaginationClicked,
            itemTexts: function (type, page, current) {
                switch (type) {
                    case "prev":
                        return "<< Back";
                    case "next":
                        return "Explore Other >>";
                }
            },
            shouldShowPage: function (type, page, current) {
                switch (type) {
                    case "first":
                    case "last":
                    case "page":
                        return false;
                    default:
                        return true;
                }
            },
            tooltipTitles: function (type, page, current) {
                switch (type) {
                    case "prev":
                        return "Go to Back";
                    case "next":
                        return "Go to Explore Other";
                }
            },
            useBootstrapTooltip: true
        };

        //perform necessary transformation on input data
        var summarizeData = chartDataBuilder();
        $(legendTitleDiv).empty();
        $(legendTitleDiv).append("<div style='position: absolute;top: 16px;left: 750px;'>Legend</div><div style='position:" +
            " absolute;top: 16px;left: 750px;'>Legend</div>");
        for (var i = 0; i < summarizeData.length; i++) {
            if (summarizeData[i][2] != "NoEntries") {
                drawLegend(summarizeData[i][2], summarizeData[i][3]);
            }
        }

        var drawingChartData = [];
        for (var i = 0; i < mockData.length; i++) {
            for (var j = 0; j < summarizeData.length; j++) {
                if (mockData[i][0] === summarizeData[j][0]) {
                    drawingChartData.push(summarizeData[j]);
                } else {
                    drawingChartData.push(mockData[i]);
                }
            }
        }
        gadgetData.schema[0].data = drawingChartData;

        //finally draw the chart on the given canvas
        gadgetData.chartConfig.width = $(canvasDiv).width();
        gadgetData.chartConfig.height = $(canvasDiv).height();
        gadgetData.chartConfig.colorDomain.push(["NoEntries"]);
        var vg = new vizg(gadgetData.schema, JSON.parse(JSON.stringify(gadgetData.chartConfig)));
        vg.draw(canvasDiv, [
            {
                type: "click",
                callback: onclick
            }
        ]);
        $(legendDiv).append("<ul class='legendText' style='list-style-type:none'><li><div id='paginate'></div></li></ul>");
        $('#paginate').bootstrapPaginator(options);
        $('[data-toggle="tooltip"]').tooltip();
    } catch (error) {
        console.log(error);
        error.message = "Error while drawing log viewer.";
        error.status = "";
        onError(error);
    }
}

function drawLegend(fullContext, id) {
    var bulletColor;
    var subContext;
    if (legendMap.get(fullContext) === undefined) {
        if (fullContext === "Other") {
            bulletColor = "#95a5a6";
            subContext = fullContext;
        } else {
            bulletColor = chartColorScale[legendMap.size];
            if (fullContext.length > 57) {
                subContext = "ID " + id + " - " + fullContext.substring(0, 57) + "...";
            } else {
                subContext = "ID " + id + " - " + fullContext;
            }
        }
        legendMap.set(fullContext, (legendMap.size + 1));
        $(legendDiv).append(createLegendList(bulletColor, fullContext, subContext));
        gadgetData.chartConfig.colorScale.push([bulletColor]);
        gadgetData.chartConfig.colorDomain.push([fullContext]);
    }
}

function onPaginationClicked(e, originalEvent, type, page) {
    globalPage = page;
    fetch((page - 1) * 10, 10);
}

function chartDataBuilder() {
    var chartDataArray = [];
    var otherDataMap = new Map();
    var chartOtherDataTuple;
    if (gadgetData.additionalColumns == null) {
        for (var i = 0; i < receivedData.length; i++) {
            chartOtherDataTuple = chartDataFormatter(receivedData[i][gadgetData.columns[0]],
                receivedData[i].values[gadgetData.columns[1]],
                receivedData[i].values[gadgetData.columns[2]], null);
            chartDataArray.push(chartOtherDataTuple);
            receivedData[i]["day"] = chartOtherDataTuple[0];
        }
        for (var i = 0; i < receivedOtherData.length; i++) {
            chartOtherDataTuple = chartOtherDataFormatter(receivedOtherData[i][gadgetData.columns[0]],
                receivedOtherData[i].values[gadgetData.columns[1]], null);
            if (otherDataMap.get(chartOtherDataTuple[0]) === undefined) {
                otherDataMap.set(chartOtherDataTuple[0], chartOtherDataTuple[1]);
            } else {
                otherDataMap.set(chartOtherDataTuple[0], otherDataMap.get(chartOtherDataTuple[0]) + chartOtherDataTuple[1]);
            }
            receivedOtherData[i]["day"] = chartOtherDataTuple[0];
        }
        otherDataMap.forEach(function (element, index, array) {
            chartDataArray.push([index, element, "Other", index]);
        });
    } else {
        for (var i = 0; i < receivedData.length; i++) {
            chartOtherDataTuple = chartDataFormatter(receivedData[i][gadgetData.columns[0]],
                receivedData[i].values[gadgetData.columns[1]],
                receivedData[i].values[gadgetData.columns[2]], receivedData[i].values.week);
            chartDataArray.push(chartOtherDataTuple);
            receivedData[i]["day"] = chartOtherDataTuple[0];
        }
        for (var i = 0; i < receivedOtherData.length; i++) {
            chartOtherDataTuple = chartOtherDataFormatter(receivedOtherData[i][gadgetData.columns[0]],
                receivedOtherData[i].values[gadgetData.columns[1]], receivedOtherData[i].values.week);
            if (otherDataMap.get(chartOtherDataTuple[0]) === undefined) {
                otherDataMap.set(chartOtherDataTuple[0], chartOtherDataTuple[1]);
            } else {
                otherDataMap.set(chartOtherDataTuple[0], otherDataMap.get(chartOtherDataTuple[0]) + chartOtherDataTuple[1]);
            }
            receivedOtherData[i]["day"] = chartOtherDataTuple[0];
        }
        otherDataMap.forEach(function (element, index, array) {
            chartDataArray.push([index, element, "Other", index]);
        });
    }
    return chartDataArray;
}

function chartDataFormatter(timestamp, count, context, additionalInfo) {
    var chartTuple = [];
    var newTimestamp = new Date(timestamp);
    var contextHashValue = hashCode(context);
    if (receivedDataIdMap.get(contextHashValue) === undefined) {
        var messageID = "ID" + (receivedDataIdMap.size + 1) + " -" + context;
        receivedDataIdMap.set(contextHashValue, [receivedDataIdMap.size + 1, messageID]);
    }
    if (timeFrame === "MONTHLY") {
        chartTuple = [months[newTimestamp.getMonth()] + " - " + newTimestamp.getFullYear(), count, context,
            receivedDataIdMap.get(contextHashValue)[0]];
    } else if (timeFrame === "WEEKLY") {
        chartTuple = ["W" + additionalInfo + " - " + months[newTimestamp.getMonth()] + " - " + newTimestamp.getFullYear(),
            count, context, receivedDataIdMap.get(contextHashValue)[0]];
    } else {
        chartTuple = [newTimestamp.toDateString(), count, context, receivedDataIdMap.get(contextHashValue)[0]];
    }
    return chartTuple;
}

function chartOtherDataFormatter(timestamp, count, additionalInfo) {
    var chartTuple = [];
    var newTimestamp = new Date(timestamp);
    if (timeFrame === "MONTHLY") {
        chartTuple = [months[newTimestamp.getMonth()] + " - " + newTimestamp.getFullYear(), count, "Other",
            months[newTimestamp.getMonth()] + " - " + newTimestamp.getFullYear()];
    } else if (timeFrame === "WEEKLY") {
        chartTuple = ["W" + additionalInfo + " - " + months[newTimestamp.getMonth()] + " - " + newTimestamp.getFullYear(),
            count, "Other", "W" + additionalInfo + " - " + months[newTimestamp.getMonth()] + " - " + newTimestamp.getFullYear()];
    } else {
        chartTuple = [newTimestamp.toDateString(), count, "Other", newTimestamp.toDateString()];
    }
    return chartTuple;
}

function queryBuilder(tableName, query, start, count, sortBy) {
    return {
        tableName: tableName,
        searchParams: {
            query: query,
            start: start, //starting index of the matching record set
            count: count, //page size for pagination
            sortBy: sortBy
        }
    };
}

function publish(data) {
    gadgets.Hub.publish(TOPIC_PUB_CONTENT, data);
};

var onclick = function (event, item) {
    if (item != null) {
        if (item.datum[gadgetData.columns[2]] === "Other") {
            for (var i = 0; i < receivedOtherData.length; i++) {
                if (receivedOtherData[i]["day"] === item.datum.day) {
                    publish(
                        {
                            "selected": receivedOtherData[i].values[gadgetData.columns[2]],
                            "fromTime": receivedOtherData[i][gadgetData.columns[0]],
                            "toTime": getToTime(receivedOtherData[i][gadgetData.columns[0]]),
                            "count": item.datum.count,
                            "filter": gadgetPropertyName
                        }
                    );
                }
            }
        } else {
            for (var i = 0; i < receivedData.length; i++) {
                if (receivedData[i].values[gadgetData.columns[2]] === item.datum[gadgetData.columns[2]] && receivedData[i]["day"] === item.datum.day) {
                    publish(
                        {
                            "selected": receivedData[i].values[gadgetData.columns[2]],
                            "fromTime": receivedData[i][gadgetData.columns[0]],
                            "toTime": getToTime(receivedData[i][gadgetData.columns[0]]),
                            "count": item.datum.count,
                            "filter": gadgetPropertyName
                        }
                    );
                }
            }
        }
    }
};

function subscribe(callback) {
    gadgets.HubSettings.onConnect = function () {
        gadgets.Hub.subscribe(TOPIC_SUB_DATE_RANGE, function (topic, data, subscriber) {
            callback(topic, data, subscriber)
        });
    };
}

subscribe(function (topic, data, subscriber) {
    timeFrom = parseInt(data["timeFrom"]);
    timeTo = parseInt(data["timeTo"]);
    timeUnit = data.timeUnit;
    initialize();
});

function daysBetween(date1, date2) {
    //Get 1 day in milliseconds
    var one_day = 1000 * 60 * 60 * 24;

    // Convert both dates to milliseconds
    var date1_ms = date1.getTime();
    var date2_ms = date2.getTime();

    // Calculate the difference in milliseconds
    var difference_ms = Math.abs(date2_ms - date1_ms);

    // Convert back to days and return
    return Math.round(difference_ms / one_day);
}


function hashCode(str) {
    var hash = 0;
    if (str.length == 0) return hash;
    for (var i = 0; i < str.length; i++) {
        var char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return zeroPad(Math.abs(hash), 13);
}

function zeroPad(num, places) {
    var zero = places - num.toString().length + 1;
    return Array(+(zero > 0 && zero)).join("0") + num;
}

function getNextWeekDay(timeStamp) {
    var dateWithWeek = new Date(moment().week(moment(timeStamp).week()).endOf('Week'));
    return dateWithWeek;
}

function getToTime(toTime) {
    var duration;
    toTime = new Date(toTime);
    if (timeFrame === "DAILY") {
        duration = toTime.getDate() + 1;
        toTime.setDate(duration);
    } else if (timeFrame === "MONTHLY") {
        duration = toTime.getMonth() + 1;
        toTime.setMonth(duration);
    } else if (timeFrame === "WEEKLY") {
        toTime = getNextWeekDay(toTime);
    }
    return toTime.getTime();
}

function onError(msg) {
    $(canvasDiv).empty();
    $(legendDiv).empty();
    $(legendTitleDiv).empty();
    $(canvasDiv).html(gadgetUtil.getErrorText(msg));
}

function createLegendList(bulletColor, fullContext, subContext){
    return "<ul class='legendText' style='list-style-type:none'><li class='context'><svg width='10' height='10'>" +
        "<circle cx='5' cy='5' r='6' fill="+bulletColor+"/></svg><span class='textContext'><a class='legendTooltip' " +
        "data-toggle='tooltip' data-placement='bottom' title=\""+fullContext+"\" style='cursor:default'>"+subContext+"</a></span></li></ul>";
}