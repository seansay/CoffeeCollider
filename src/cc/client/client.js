define(function(require, exports, module) {
  "use strict";
  
  var cc = require("./cc");
  var extend = require("../common/extend");
  var pack   = require("../common/pack").pack;
  var Timeline = require("./sched").Timeline;
  var node     = require("./node");
  var buffer   = require("./buffer");
  var commands = {};
  
  var SynthClient = (function() {
    function SynthClient() {
      this.klassName = "SynthClient";
      this.sampleRate = 0;
      this.channels   = 0;
      this.strmLength = 0;
      this.bufLength  = 0;
      this.userId     = 0;
      this.timeline   = new Timeline(this);
      this.rootNode   = new node.Group();
      this.commandList = [];
      this.bufferRequestId = 0;
      this.bufferRequestCallback = {};
      this.phase = 0;
    }
    
    SynthClient.prototype.sendToIF = function() {
      // should be overridden
    };
    SynthClient.prototype.recvFromIF = function(msg) {
      var func = commands[msg[0]];
      if (func) {
        func.call(this, msg);
      } else {
        this.sendToServer(msg);
      }
    };
    SynthClient.prototype.sendToServer = function() {
      // should be overridden
    };
    SynthClient.prototype.recvFromServer = function(msg) {
      if (msg instanceof Float32Array) {
        this.sendToIF(msg);
        return;
      }
      if (msg) {
        var func = commands[msg[0]];
        if (func) {
          func.call(this, msg);
        } else {
          this.sendToIF(msg);
        }
      }
    };
    SynthClient.prototype.pushCommand = function(cmd) {
      this.commandList.push(cmd);
    };
    SynthClient.prototype.play = function(msg) {
      this.timeline.play();
      this.sendToServer(msg);
    };
    SynthClient.prototype.pause = function(msg) {
      this.sendToServer(msg);
    };
    SynthClient.prototype.reset = function(msg) {
      buffer.reset();
      node.reset();
      this.timeline.reset();
      this.sendToServer(msg);
    };
    SynthClient.prototype.requestBuffer = function(path, callback) {
      if (!(typeof path === "string" && typeof callback === "function")) {
        return;
      }
      var requestId = this.bufferRequestId++;
      this.bufferRequestCallback[requestId] = callback;
      this.sendToIF(["/buffer/request", path, requestId]);
    };
    SynthClient.prototype.process = function() {
      // should be overridden
    };
    
    return SynthClient;
  })();
  
  
  var WorkerSynthClient = (function() {
    function WorkerSynthClient() {
      SynthClient.call(this);
    }
    extend(WorkerSynthClient, SynthClient);
    
    WorkerSynthClient.prototype.sendToIF = function(msg) {
      postMessage(msg);
    };
    WorkerSynthClient.prototype.process = function() {
      this.timeline.process();
      this.sendToServer([
        "/command", this.userId, [ this.commandList.splice(0) ]
      ]);
    };
    
    return WorkerSynthClient;
  })();
  
  
  var IFrameSynthClient = (function() {
    function IFrameSynthClient() {
      SynthClient.call(this);
      var that = this;
      this.server = new Worker(cc.coffeeColliderPath);
      this.server.onmessage = function(e) {
        that.recvFromServer(e.data);
      };
      require("../common/console").receive(commands);
    }
    extend(IFrameSynthClient, SynthClient);
    
    IFrameSynthClient.prototype.sendToServer = function(msg) {
      this.server.postMessage(msg);
    };
    IFrameSynthClient.prototype.process = function() {
      var timeline = this.timeline;
      var n = this.strmLength / this.bufLength;
      var list = [];
      while (n--) {
        timeline.process();
        list.push(this.commandList.splice(0));
      }
      this.sendToServer([
        "/command", this.userId, list
      ]);
    };
    
    return IFrameSynthClient;
  })();

  commands["/connect"] = function(msg) {
    this.userId = msg[5]|0;
    this.sendToIF(msg);
  };
  commands["/init"] = function(msg) {
    this.sampleRate = msg[1]|0;
    this.channels   = msg[2]|0;
    this.strmLength = msg[3]|0;
    this.bufLength  = msg[4]|0;
    this.sendToServer(msg);
  };
  commands["/play"] = function(msg) {
    this.play(msg);
  };
  commands["/pause"] = function(msg) {
    this.pause(msg);
  };
  commands["/reset"] = function(msg) {
    this.reset(msg);
  };
  commands["/process"] = function() {
    this.process();
  };
  commands["/execute"] = function(msg) {
    var execId   = msg[1];
    var code     = msg[2];
    var append   = msg[3];
    var data     = msg[4];
    var callback = msg[5];
    if (!append) {
      this.reset(["/reset"]);
    }
    global.DATA = data;
    var result = eval.call(global, code);
    if (callback) {
      this.sendToIF(["/execute", execId, pack(result)]);
    }
  };
  commands["/buffer/response"] = function(msg) {
    var buffer = msg[1];
    var requestId = msg[2];
    var callback = this.bufferRequestCallback[requestId];
    if (callback) {
      callback(buffer);
      delete this.bufferRequestCallback[requestId];
    }
  };
  commands["/importScripts"] = function(msg) {
    importScripts(msg[1]);
  };
  
  commands["/n_end"] = function(msg) {
    var nodeId = msg[1]|0;
    var n = node.get(nodeId);
    if (n) {
      n.emit("end");
    }
  };
  commands["/n_done"] = function(msg) {
    var nodeId = msg[1]|0;
    var tag    = msg[2];
    var n = node.get(nodeId);
    if (n) {
      n.emit("done", tag);
    }
  };
  
  var install = function() {
    var client;
    if (cc.context === "iframe") {
      client = new IFrameSynthClient();
    } else {
      client = new WorkerSynthClient();
    }
    cc.client = client;
    var listener = function(e) {
      var msg = e.data;
      if (msg instanceof Float32Array) {
        msg[C.USER_ID] = client.userId;
        client.sendToServer(msg);
      } else {
        client.recvFromIF(msg);
      }
    };
    if (cc.context === "iframe") {
      window.onmessage = function(e) {
        e.ports[0].onmessage = listener;
        client.sendToIF = function(msg) {
          e.ports[0].postMessage(msg);
        };
        window.onmessage = null;
      };
    } else if (cc.context === "worker") {
      global.onmessage = listener;
    }
  };
  
  module.exports = {
    install: install
  };

});
