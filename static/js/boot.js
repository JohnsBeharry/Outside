/**
 * Starts up the whole application.
 *
 * @param {Boolean} development Are we in our development env.
 * @api private
 */
(function(development){
	/**
	 * Add Node.js Event Emitter API compatiblity
	 */
	Backbone.Events.emit = Backbone.Events.trigger;
	Backbone.Events.on = Backbone.Events.bind;
	Backbone.Events.removeListener = Backbone.Events.unbind;
	Backbone.Events.once = function(event, func){
		var self = this
		
			/**
			 * Removeable shizzle
			 */
			, removeable = function(){
				func.apply(this, arguments);
				self.removeListener(event, removeable);
			};
			
		this.on(event, removeable);
	};
	
	/**
	 * Evented Socket.IO stream parser
	 */
	var EventedParser = {
		
		/**
		 * Parse responses from the Socket.IO server and emits the correct
		 * event based on the data type
		 * 
		 * @param {Object} response The message from the server
		 * @api public
		 */
		response: function(response){
			development && console.dir( response );
			if (response.type && typeof response.type === "string" && EventedParser.proxy[ response.type ]){
				if ('meta' in response && EventedParser.proxy[response.meta])
					return EventedParser.trigger(EventedParser.proxy[response.meta], response);
				
				return EventedParser.trigger(EventedParser.proxy[response.type], response);
			}
		},
		
		/**
		 * Add the Socket.IO connection to the parser and
		 * connect the response parser to it
		 *
		 * @param {Socket.IO} io Socket.IO connection
		 * @api public
		 */
		register: function(io){
			this.io = io;
			this.io.on("message", this.response);
		},
		
		/**
		 * A list of allowed and available events, mapped to 
		 * different event names.
		 *
		 * @type {Object}
		 * @api public
		 */
		proxy: {
			// validation
			'check:nickname':	 	'check:nickname',
			
			// messages
			'notice':				'notice',
			'error':				'error',
			
			// user events
			'private' : 		'user:private',
			'unicorn':			'user:disconnect',
			
			// channel events
			'message' : 		'channel:message',
			'announcement': 'channel:announcement',
			'nick:change': 	'channel:nickname',
			'user:join':		'channel:join',
			'user:depart':	'channel:depart',
			
			// status sync
			'update': 			'status:update'
		},
		
		API: {
			/**
			 * Ask for a new nickname.
			 *
			 * @param {String} nickname The new nickname
			 * 
			 * @api public
			 */
			nickname: function(nickname){
				EventedParser.io.send({type:"nickname", nickname:nickname.toString()});
			},
			
			/**
			 * Send a new Private Message
			 *
			 * @param {String} to The nickname of the user to send the message to
			 * @param {String} message The message to the user
			 *
			 * @api public
			 */
			private: function(to, message){
				 io.send({type:"private", to: to, message: message.toString(), nickname: EventedParser.io.nickname});
			},
			
			/**
			 * Blacklist a nickname to prevent them from sending pm
			 *
			 * @param {String} nickname The nickname that needs to blocked
			 *
			 * @api public
			 */
			blacklist: function(nickname){
				io.send({type:"blacklist", blacklist:nickname.toString(), nickname: EventedParser.io.nickname});
			},
			
			/**
			 * Sends a new message to the current chatbox
			 *
			 * @param {String} message The message that needs to be send to the chatbox
			 *
			 * @api public
			 */
			send: function(message){
				var request = {type:"message", message: message.toString(), nickname: io.nickname, rooms: io.rooms};
				io.send(request);
				EventedPaser.emit("channel:message", request)
			}
		},
		
		/**
		 * Sends a check to the server to validate the field and value, this is needed
		 * because we will be working with allot of concurrent users and double values may not
		 * be permitted by the server instance.
		 *
		 * @param {String} field The field that needs to be validated
		 * @param {String} value The value of the field
		 *
		 * @api public
		 */
		check: function(field,value){
			this.io.send({type:"validate:check", field:field, value:value})
		}
	};
	_.extend(EventedParser, Backbone.Events);
	
	/**
	 * Outside, Backbone Controller
	 * 
	 * @constructor
	 * @api public
	 */
	var Outside = Backbone.Controller.extend({
		/**
		 * Setup the routes -> locations
		 */
		routes: {
			"/": 											"loaded",
			"/signup/service/:type": 	"service",
			"/hello/:nickname": 			"setup"
		},
		
		/**
		 * Establish a connection with the server when a new `Outside` application 
		 * has been created. The connection is established using `Socket.IO`
		 */
		initialize: function(){
			development && console.log("Application loaded");
			
			this.state = 'auth';
			this.io = new io.Socket(null, { rememberTransport:false });
			this.io.connect();
			this.environment = {};
			
			EventedParser.register(this.io);
			
			// Add a form handler for the .auth panel because this can be accesed using 2 different urls
			var self = this
				, form = $(".auth form").live("submit", function(e){
					e && e.preventDefault();
					
					var tmp;
					if (self.state === 'auth'){
						tmp = form.find('input[name="nickname"]');
						if (tmp.val() === '') return alert('Nickname is required, ZING!');
						
						EventedParser.once("check:nickname", function(data){
							if( data && data.validates ){
								$("html").addClass("loggedin").find(".auth").hide().end().find("div.app").show();
							} else {
								alert(data ? data.message : "Unable to validate the nickname")
							}
						});
						
						EventedParser.check("nickname", tmp.val() );
					}
			});
			
			/*
			// NOTE: the following lines of code are only used during development, need to find a more
			// elegant solution for this instead of chaining the shit out of it
			$(".auth .regular button").click(function login(e){
				e && e.preventDefault()
				$("html").addClass("loggedin").find(".auth").hide().end().find("div.app").show();
			});
			
			$("aside.details h4 a").click(function realtime(e){
				var self = $(this);
				self.hasClass("realtime") ? self.removeClass("realtime").addClass("realtime-enabled") : self.removeClass("realtime-enabled").addClass("realtime")
			});*/
		},
		
		/**
		 * The inital sign up page
		 */
		loaded: function(){
			this.state = 'auth';
			$(".auth form").find(".regular").show().end().find(".services").hide();
			
		},
		
		setup: function(nickname){
			//this.io
		},
		
		
		service: function(type){
			this.state = 'auth:service';
			
			alert("zomg, service fails, login using a normal acount, kay?");
			// ignore the awful chaining, this is just a filty hack
			if (!type) 
				$(".auth form").find(".regular").hide().end().find(".services").show()
		}
	});
		
	/**
	 * Initiate `Outside` application
	 */
	var Application = new Outside();
	Backbone.history.start();
	
	// if the hash `#/` isn't set, we are going to load it, so our "loaded" method
	// is called.
	if (!location.hash) Application.saveLocation("/"), Backbone.history.loadUrl();
	
	// only expose an external API when we are in development mode
	if (development) window.Application = Application;
}(location.port === "8908"));