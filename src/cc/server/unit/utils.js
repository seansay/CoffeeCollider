define(function(require, exports, module) {
  "use strict";

  var nanToZero = function(out) {
    for (var i = out.length; i--; ) {
      if (isNaN(out[i])) {
        out[i] = 0;
      }
    }
    return out;
  };
  
  var zapgremlins = function(a) {
    if (isNaN(a) || (-1e-6 < a && a < 0) || (0 <= a && a < +1e-6)) {
      return 0;
    }
    return a;
  };
  
  var avoidzero = function(a) {
    if (a < 0) {
      if (-1e-6 < a) {
        a = -1e-6;
      }
    } else if (a < +1e-6) {
      a = 1e-6;
    }
    return a;
  };
  
  module.exports = {
    nanToZero  : nanToZero,
    zapgremlins: zapgremlins,
    avoidzero  : avoidzero,
  };

});
