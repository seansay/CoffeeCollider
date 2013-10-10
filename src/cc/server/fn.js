define(function(require, exports, module) {
  "use strict";

  var slice = [].slice;
  
  var fn = (function() {
    function Fn(func) {
      this.func = func;
      this.def  = "";
    }
    Fn.prototype.defaults = function(def) {
      this.def = def;
      return this;
    };
    Fn.prototype.build = function() {
      var func = this.func;
      var keys = [];
      var vals = [];
      this.def.split(",").forEach(function(items) {
        items = items.trim().split("=");
        keys.push( items[0].trim());
        vals.push(items.length > 1 ? +items[1].trim() : undefined);
      });
      var ret = func;
      if (this.def !== "") {
        ret = function() {
          return func.apply(this, resolve_args(keys, vals, slice.call(arguments)));
        };
      }
      return ret;
    };
    var resolve_args = function(keys, vals, given) {
      var dict;
      var args = vals.slice();
      if (fn.isDictionary(given[given.length - 1])) {
        dict = given.pop();
        for (var key in dict) {
          var index = keys.indexOf(key);
          if (index !== -1) {
            args[index] = dict[key];
          }
        }
      }
      for (var i = 0, imax = Math.min(given.length, args.length); i < imax; ++i) {
        args[i] = given[i];
      }
      if (dict && args.length < keys.length - 1) {
        args.push(dict);
      }
      return args;
    };
    return function(func) {
      return new Fn(func);
    };
  })();

  fn.extend = function(child, parent) {
    for (var key in parent) {
      if (parent.hasOwnProperty(key)) {
        child[key] = parent[key];
      }
    }
    /*jshint validthis:true */
    function ctor() {
      this.constructor = child;
    }
    /*jshint validthis:false */
    ctor.prototype = parent.prototype;
    /*jshint newcap:false */
    child.prototype = new ctor();
    /*jshint newcap:true */
    child.__super__ = parent.prototype;
    return child;
  };

  fn.classmethod = (function() {
    var _classmethod = function(Klass, func) {
      return function() {
        if (this instanceof Klass) {
          return func.apply(this, arguments);
        } else {
          return func.apply(new Klass(), arguments);
        }
      };
    };
    return function(child) {
      var classmethods = child.classmethods || {};
      Object.keys(child.prototype).forEach(function(key) {
        if (key.charAt(0) === "$" && typeof child.prototype[key] === "function") {
          classmethods[key] = child.prototype[key];
          delete child.prototype[key];
        }
      });
      Object.keys(classmethods).forEach(function(key) {
        var func = classmethods[key];
        key = key.substr(1);
        child[key] = _classmethod(child, func);
        child.prototype[key] = func;
      });
      child.classmethods = classmethods;
    };
  })();
  
  fn.isDictionary = function(obj) {
    return !!(obj && obj.constructor === Object);
  };

  module.exports = fn;

});
