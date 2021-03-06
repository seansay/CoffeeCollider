define(function(require, exports, module) {
  "use strict";
  
  var cc = require("./cc");
  var pack   = require("../common/pack").pack;
  var commands = {};
  
  var SynthLang = (function() {
    function SynthLang() {
      this.klassName = "SynthLang";
      this.sampleRate = 0;
      this.channels   = 0;
      this.strmLength = 0;
      this.bufLength  = 0;
      this.rootNode   = cc.createGroup();
      this.taskManager   = cc.createTaskManager();
      this.timelineResult  = [];
      this.bufferRequestId = 0;
      this.bufferRequestCallback = {};
      this.phase = 0;

      this.extendCommands(commands);
    }
    
    SynthLang.prototype.sendToClient = function() {
      throw "SynthLang#sendToClient: should be overridden";
    };
    SynthLang.prototype.recvFromClient = function(msg) {
      if (msg) {
        var func = commands[msg[0]];
        if (func) {
          func.call(this, msg);
        }
      }
    };
    SynthLang.prototype.sendToServer = function() {
      throw "SynthLang#sendToServer: should be overridden";
    };
    SynthLang.prototype.recvFromServer = function(msg) {
      if (msg instanceof Int16Array) {
        this.sendToClient(msg);
      } else {
        var func = commands[msg[0]];
        if (func) {
          func.call(this, msg);
        } else {
          throw new Error("Unknown command: " + msg[0]);
        }
      }
    };
    SynthLang.prototype.pushToTimeline = function(cmd) {
      this.timelineResult.push(cmd);
    };
    SynthLang.prototype.play = function(msg) {
      this.taskManager.play((this.bufLength / this.sampleRate) * 1000);
      this.sendToServer(msg);
    };
    SynthLang.prototype.pause = function(msg) {
      this.sendToServer(msg);
    };
    SynthLang.prototype.reset = function(msg) {
      cc.resetBuffer();
      cc.resetNode();
      cc.resetNativeTimers();
      this.taskManager.reset();
      this.sendToServer(msg);
    };
    SynthLang.prototype.requestBuffer = function(path, callback) {
      if (!(typeof path === "string" && typeof callback === "function")) {
        return;
      }
      var requestId = this.bufferRequestId++;
      this.bufferRequestCallback[requestId] = callback;
      this.sendToClient(["/buffer/request", path, requestId]);
    };
    SynthLang.prototype.process = function() {
      throw "SynthLang#process: should be overridden";
    };
    SynthLang.prototype.extendCommands = function() {
    };
    
    return SynthLang;
  })();
  
  
  commands["/connected"] = function(msg) {
    if (cc.opmode !== "nodejs") {
      msg.push(Object.keys(cc.global));
    }
    this.sendToClient(msg);
  };
  commands["/init"] = function(msg) {
    this.sampleRate = msg[1]|0;
    this.channels   = msg[2]|0;
    this.sendToServer(msg);
  };
  commands["/play"] = function(msg) {
    this.play(msg);
  };
  commands["/played"] = function(msg) {
    this.sendToClient(msg);
  };
  commands["/pause"] = function(msg) {
    this.pause(msg);
  };
  commands["/paused"] = function(msg) {
    this.sendToClient(msg);
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
    cc.DATA = data;
    if (cc.global !== global) {
      global.cc = cc.global;
    }
    global.cc.__context__ = this.taskManager.context;
    var result = eval.call(global, code);
    if (callback) {
      this.sendToClient(["/executed", execId, pack(result)]);
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
  commands["/console/log"] = function(msg) {
    this.sendToClient(msg);
  };
  commands["/console/debug"] = function(msg) {
    this.sendToClient(msg);
  };
  commands["/console/info"] = function(msg) {
    this.sendToClient(msg);
  };
  commands["/console/warn"] = function(msg) {
    this.sendToClient(msg);
  };
  commands["/console/error"] = function(msg) {
    this.sendToClient(msg);
  };
  commands["/emit/n_end"] = function(msg) {
    var nodeId = msg[1]|0;
    var n = cc.getNode(nodeId);
    if (n) {
      n.emit("end");
    }
  };
  commands["/emit/n_done"] = function(msg) {
    var nodeId = msg[1]|0;
    var tag    = msg[2];
    var n = cc.getNode(nodeId);
    if (n) {
      n.emit("done", tag);
    }
  };
  
  cc.SynthLang = SynthLang;
  
  module.exports = {
    use: function() {
      require("../common/timer");
      require("../common/console");
      require("./buffer");
      require("./node");
      require("./pattern");
      require("./random");
      require("./scale");
      require("./task");
      require("./synthdef");
      require("./ugen/ugen");
      require("./lang-worker");
      require("./lang-iframe");
      require("./lang-nodejs");
      require("./lang-socket");
      
      cc.createSynthLang = function() {
        require("./array");
        require("./boolean");
        require("./data");
        require("./date");
        require("./function");
        require("./number");
        require("./object");
        require("./string");
        
        switch (cc.opmode) {
        case "worker":
          return cc.createWorkerSynthLang();
        case "iframe":
          return cc.createIFrameSynthLang();
        case "nodejs":
          return cc.createNodeJSSynthLang();
        case "socket":
          return cc.createSocketSynthLang();
        }
        throw new Error("A SynthLang is not defined for: " + cc.opmode);
      };
      cc.replaceNativeTimerFunctions();
    }
  };

  module.exports.use();

});
