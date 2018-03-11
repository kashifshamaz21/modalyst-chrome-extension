// Globals
var contentScripPort, popupDialogPort;

// When the extension is installed or upgraded ...
chrome.runtime.onInstalled.addListener(function() {
  // Replace all rules ...
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    // With a new rule ...
    chrome.declarativeContent.onPageChanged.addRules([
      {
        // That fires when a page's URL contains a 'plus.google.com/communities/' ...
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { urlContains: 'modalyst.co/explore/' },
          })
        ],
        // And shows the extension's page action.
        actions: [ new chrome.declarativeContent.ShowPageAction() ]
      }
    ]);
  });
});

/**********  Listeners for "Content script <==== Port =====> Background script" (background.js) ********/

// This method is invoked from index.js, when the pop-up is clicked/rendered.
// It creates a long-lived Port connection with content script, to send & receive messages to/from content script.
function setupCommunication() {

  chrome.tabs.query({ active: true, currentWindow: true, windowType: "normal" }, function( tabs ) {
      
      // Create a port with the currently active tab
      contentScripPort = chrome.tabs.connect(tabs[0].id, { name: "Extension-ContentScript" });

      contentScripPort.onMessage.addListener(function(msg) {    
        console.log("Received msg from content script: " + msg.type);

        if(chrome.extension.getViews({ type:'popup' }).length > 0) {
          popUpView = chrome.extension.getViews({type:'popup'})[0];
          popUpView.onMessageReceived(msg);
        }
        
      });
  });
}

// This method is invoked from index.js (popup dialog), to send a message to content script, over long-lived port connection
function postMessageOverPort(msg) {
  console.log("Sending msg from popUpView to content script via background.js: " + msg.type);
  contentScripPort.postMessage(msg);
}


/**********  Listeners for "Background script <====>Port<=====> Popup Dialog" (index.js) ********/

// We establish a port from popup dialog (index.js) to background.js. This is to detect when the popup closes.
// when popup closes, we disconnect the port established with content script
chrome.runtime.onConnect.addListener( function(receivedPort) {

  console.log("Received Incoming Port connection from index.js: " + receivedPort.name);
  popupDialogPort = receivedPort;
  popupDialogPort.onDisconnect.addListener( function(disconnectedPort) {
    console.log('Received port disconnect event from backgound.js: ' + disconnectedPort.name);
    disconnectContentScriptPort();
  });

});

// When the popup dialog closes, it results in a onDisconnect event on the port between popup and background.js.
// In that case, we disconnect the port established with content script as Extension Popup UI is removed and doesn't need to 
// receive any messages from content script
function disconnectContentScriptPort() {
  if(contentScripPort) {
    contentScripPort.disconnect();
  }
}

