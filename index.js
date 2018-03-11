
// Globals
// Background Page 
var backgroundPage; 

$(document).ready(function() {

    backgroundPage = chrome.extension.getBackgroundPage();
   
    $('.import-items-button.active').on('click', importProducts);
    $('.cancel-import-items-button').on('click', cancelEvent);

    connectToContentScript();
    connectToBackgroundScript();
});
                                             
// Communication Channel:  Content Script <===port===> background.js <===window====> index.js

// Through the background page, create a long-live port connection with content script for 2-way message exchange 
function connectToContentScript () {
  if(backgroundPage) {
    backgroundPage.setupCommunication();
  }
}

// We establish a port with background script, but this port is only used to "figure out" when popup dialog closes.
// Currently, there's no event that gets triggered when Popup dialog closes.
// For more details: https://bugs.chromium.org/p/chromium/issues/detail?id=31262
function connectToBackgroundScript () {
  chrome.runtime.connect({ name: "Popup-BackgroundScript" });
}

// Triggered by the background.js script, when it receives a message from content script via the long-lived port connection
function onMessageReceived(msg) {
  changeJobStatus(msg);
}

// post a Message to the background.js script. It will forward this message to content script via the long-lived port connection.
function postMessageOverPort(msg) {
  if(backgroundPage) {
    backgroundPage.postMessageOverPort(msg);
  }
}

// Send a message to content script that "popup" has loaded. It can send back useful info in reply to this.
function popupLoaded() {
  postMessageOverPort({type: 'popupLoaded'});
}

function importProducts( event ) {
  if( $(event.currentTarget).hasClass('active'))
    postMessageOverPort({type: 'importProducts'});
}

function cancelEvent( event ) {
  postMessageOverPort({type: 'cancel'});
}

function changeJobStatus( msg ) {
  var progress;

  switch (msg.type) {

    // After port is created between background and content script, content script sends this message as an Ack for it. Reply back.
    case "connected":
      popupLoaded();
      break;

    case "init":
      resetPopupUI();
      break;

    case "stats":
      $(".items-count").removeClass("visibility-hidden").text("Total Items: " + msg.totalProductsCount);
      $(".pages-count").removeClass("visibility-hidden").text("Total Pages: " + msg.totalProductPages);
      break;

    case "importing":
      progress = msg.percentageImported + "%";

      $(".cancel-import-items-button").removeClass("visibility-hidden");
      $(".job-status").removeClass("visibility-hidden").text("Imported: " + msg.productsImported + " items");
      $(".import-items-button").removeClass("active  ").addClass("importing").attr('data-importing', progress);;
      $(".progress-bar").removeClass(" completed").addClass("importing").width(progress);
      break;

    case "completed":
      progress = msg.percentageImported + "%";

      $(".cancel-import-items-button").removeClass("visibility-hidden").addClass('reset').text('Reset');
      $(".job-status").removeClass("visibility-hidden").text(msg.productsImported + " Items imported");
      $(".import-items-button").removeClass("active  importing ").addClass("completed");
      $(".progress-bar").removeClass("importing").addClass("completed").width(progress);
      
      break;

    case "error": 
      $(".cancel-import-items-button").removeClass("visibility-hidden");
      $(".job-status").removeClass("visibility-hidden").text("Error encountered. Please click Cancel and reset.");
      $(".progress-bar").removeClass("importing").addClass("completed").width(progress);
      break;

    default:
  }
}

// once the copy functionality is completed , reset all globals and do cleanup here.
function resetPopupUI() {
  $(".cancel-import-items-button").removeClass('reset').addClass("visibility-hidden").text('Cancel');
  $('.job-status').addClass('visibility-hidden');
  $('.import-items-button').removeClass('importing completed').addClass('active');
  $(".progress-bar").removeClass("importing completed");
}


