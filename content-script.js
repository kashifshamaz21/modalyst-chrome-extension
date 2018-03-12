/*states of the application : 
0) connected: Inform Background script that content script has received port connection
1) init : initialize the Popup UI.
2) importing : click on 'Add to Import list' for each product 
3) completed : All products imported 
*/

//globals

var port, totalProducts, totalPages, startPageNumber, currentPageNumber, importSuccessTimers = {}, productsImported = [], finalData;
var currentState = "init";
var productItems = [], totalItemsOnCurrentPage, itemIdsOnCurrentPage = [], deferred;
var membersProcessed = 0, percentageScrolled, percentageImported;
    
setUpCommunication();

$(document).ready(function() {
    
});

//listeners for messages from background.js
function setUpCommunication() {
    
    console.log('setting up listeners for Incoming port connection');

    chrome.runtime.onConnect.addListener(function(receivedPort) {
        console.log("Received Incoming Port connection from background.js: " + receivedPort.name);

        port = receivedPort;

        port.onMessage.addListener(function(msg) {    
          console.log("Received msg from background script: " + msg.type);

          switch(msg.type) {
            case "popupLoaded": popupLoaded(); break;
            case "importProducts": startImportJob(); break;
            case "cancel": cancelImport(); break;
            case "reset": reset(); break;
          }
        });

        // This event gets fired when port.disconnect() is called from the other end (background script)
        port.onDisconnect.addListener( function(disconnectedPort) {
            console.log('Received port disconnect event from background.js: ' + disconnectedPort.name);
            port = null;
        });

        postMessage({ type: 'connected' });
    });
}

// This msg is posted from index.js, when the popup dialog is loaded each time. Publish everything useful to restore popup UI correctly. 
function popupLoaded() {
    scrapeTotalProductsCount();
    publishCurrentState();
}

function scrapeTotalProductsCount() {
    var items;

    if($(".showing-nn-of-N").length && ($($(".showing-nn-of-N")[0]).find('.N').text() !== "")) {

        items = $($(".showing-nn-of-N")[0]).find('.N').text();

        totalProducts = window.parseInt(items, 10);

        if(!_.isNaN(totalProducts)) {
            totalPages = Math.ceil(totalProducts / 60);
            startPageNumber = parseInt($('.step-links b.current').text(), 10);            
            totalProductsFromCurrent = totalProducts - (startPageNumber - 1) * 60;

            console.log('Total pages: ' + totalPages);
            // Update Extension UI with this info
            postMessage({ type: 'stats' });
        } else {
            console.error('Error while parsing total products count');
        }
    }
}

function toggleFilterElements(disable) {
    if(disable) {
        $('.filteroptions input').attr("disabled", "disabled");
        $('#item_search input, select').attr("disabled", "disabled");
    } else {
        $('.filteroptions input').removeAttr("disabled");
        $('#item_search input, select').removeAttr("disabled");
    }    
}

function startImportJob() {
    currentPageNumber = parseInt($('.step-links b.current').text(), 10);
    toggleFilterElements(true);
    importProducts(currentPageNumber);
}

function importProducts(currentPageNum) {
    var pageLoadingStarted = false;

    if(currentPageNum <= totalPages) {
    
        itemIdsOnCurrentPage = [];

        var itemsList = $('.item_display');
        totalItemsOnCurrentPage = itemsList.length;

        _.each(itemsList, function(item, index, list) {
            itemIdsOnCurrentPage.push($(item).attr('id'));
        });

        currentState = 'importing';

        importProductsOnPage(0).then(function() {
            currentPageNumber++;

            if(currentPageNumber > totalPages) {
                currentState = 'completed';
                toggleFilterElements(false);
                publishCurrentState();
                
            } else {
                loadPage(currentPageNumber).then(function() {
                    importProducts(currentPageNumber);
                });
            }
        }, function() {
            console.warn('Job terminated while in progress');
        });
    }
}

function loadPage(pageNumber) {
    var loadPageDeferred = Q.defer();

    var nextPage = $('a[data-page="' + pageNumber + '"]' );
    if(nextPage.length) {
        nextPage[0].click();
    }

    pageLoadingTimer = window.setInterval(function() {
        if($('.loading-screen').length) {
            pageLoadingStarted = true;
        }
        if(!$('.loading-screen').length && pageLoadingStarted) {
            pageLoadingStarted = false;
            window.clearInterval(pageLoadingTimer);
            loadPageDeferred.resolve();
        }
    }, 10);

    return loadPageDeferred.promise;
}

function importProductsOnPage(itemIndex) {
    var msgType = 'importing';

    if(itemIndex === 0) {
        deferred = Q.defer();
    } else if (currentState !== 'importing') {
        deferred.reject();
    }

    if(itemIndex === totalItemsOnCurrentPage) {
        deferred.resolve();
    } else {
        var item = $('#' + itemIdsOnCurrentPage[itemIndex]);
        var itemId = itemIdsOnCurrentPage[itemIndex];

        $('html')[0].scrollTop = $(item).offset().top - 180;
        $(item).find('.detail-overlay').css('opacity', 1);

        if($(item).find('.detail-overlay .css-icon-eye').length === 0) {
            $(item).find('.detail-overlay .add-button').click();
        }
        importSuccessTimers[itemId] = window.setInterval(_.bind(function() {
                                    if($(this).find('.detail-overlay .css-icon-eye').length > 0 && currentState === 'importing') {
                                        $(this).find('.detail-overlay').attr('style', function(i, style)
                                        {
                                            return style && style.replace(/opacity[^;]+;?/g, '');
                                        });
                                        productsImported.push($(this).attr('id'));
                                        percentageImported = calculateProgress( productsImported.length, totalProductsFromCurrent );
                                        postMessage({type: msgType });
                                        window.clearInterval(importSuccessTimers[$(this).attr('id')]);

                                        itemIndex++;
                                        importProductsOnPage(itemIndex);
                                    }
                                }, item), 5);
    }

    return deferred.promise;
}

// once the copy functionality is completed / cancelled, reset all globals and do cleanup here.
function reset() {
    productsImported = [];
    currentState = "init";
    _.each(importSuccessTimers, function(timerId, itemIndex, list) {
        window.clearInterval(timerId);
    });
}

//utility
function calculateProgress( done, total ){
    var percentage = Math.ceil(( done / total ) * 100);
    return percentage ;
}

// Publish the current state of the email extraction. This is to handle opening/closing of popups in between an extraction run.
function publishCurrentState() {
    postMessage({ type: currentState });
}

function postMessage(msg) {
    var msgType = msg.type;

    if (port) {
        switch(msgType) {
            case 'connected':
                port.postMessage({ type: msgType });
                break;
            case 'init':
                port.postMessage({ type: msgType });
                break;
            case 'stats':
                port.postMessage({ type: msgType, 
                                   totalProductsCount: totalProducts, 
                                   totalProductPages: totalPages, 
                                   startPageNumber: startPageNumber,
                                   totalProductsFromCurrent: totalProductsFromCurrent });
                break;
            case 'importing':
                console.log('Sending progress to Extension: ' + percentageImported);
                port.postMessage({type: msgType, productsImported: productsImported.length, percentageImported: percentageImported, currentPageNumber: currentPageNumber });
                break;
            case 'completed':
                port.postMessage({type: msgType, productsImported: productsImported.length, percentageImported: percentageImported });
                break;
            case 'error':
                port.postMessage({ type: msgType });
                break;
        }
    } 
}

function cancelImport( event ) {
    toggleFilterElements(false);

    switch( currentState ) {
        case "init":        reset();
                            publishCurrentState();
                            break;
        case "importing" : ( productsImported.length === 0 ) ? reset() : currentState = "completed";
                            publishCurrentState(); 
                            break;
        case "completed":   reset();
                            publishCurrentState();
                            break;
        case "error"     :  reset();
                            publishCurrentState(); 
                            break;
    }
}




