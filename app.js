/**
 * Capture uncaughtExceptions at the top to capture.
 */
process.addListener( "uncaughtException", function captureException( err ){
	console.log( err.stack.split( "\n" ) );
	console.dir( err );
});

/**
 * Module depedencies.
 */
var Manager = require('./lib/manager')
	, api = require('./conf/api')
	, express = require('express')
  , io  = require('socket.io')
	, auth = require('connect-auth')
	, gravatar = require('gravatar')

/**
 * Initiate
 */
require("./lib/io")(io);
require("express-namespace");
var app = express.createServer();

/**
 * Configure the middleware for Express.
 */
app.configure(function(){
	// Set up our default templating and template processor
	// we need to register a .html handler or we need to parse a .ejs file
	app.set( "view engine", "ejs" );
	app.set( "views", __dirname + '/views' );
	app.use( express.favicon() );
	app.use( express.cookieParser() );
	app.use( auth([
			auth.Twitter({consumerKey: api.TWITTER_CONSUMER, consumerSecret: api.TWITTER_SECRET})
	,		auth.Facebook({appId : api.FACEBOOK, appSecret: api.FACEBOOK_SECRET, scope: "email", callback: 'someurl'})
	]) )
	app.use( express.static( __dirname + '/static' ) );
});
 
/**
 * Setup the routers.
 */
app.get("/", function(req, res){
	res.render("index");
});

app.get("/*", function(req, res){
	res.redirect('/', 301);
});

/**
 * Setup Socket.IO and attach the correct listeners
 */
io = io.listen(app);
io.on('connection', function( client ){
	/**
	 * Attach the default properties on the connected cliend
	 * @type {Object}
	 */
	client.details = {
			words: 0
		,	lines: 0
		, resync: 0
		, session: new Date()
	};
	
	/**
	 * Simple message filtering.
	 *
	 * @param {Object} data The data that needs to cleaned out before we send it to the client
	 * @api private
	 */
	client.filter = function(data){ return client.send(channel.filter( data, client )) };
	
	/**
	 * Simple message delegation so we can create a cleaner message handler
	 * by using re-emitting the message types and handle it there.
	 *
	 * @param {Ojbect} data The message from the client
	 * @api private
	 */
	client.on( 'message', function( data ){
		if ( data && data.type && typeof data.type === 'string' && !/message|connect|disconnect/.test( data.type ) ){
			return client.emit(data.type, data);
		} else {
			client.filter({type:'unicorn', message: 'Incorrect message format'});
		}
	});
	
	/**
	 * Validates data that we receive from the server for validation puposes. For example for checking
	 * of double nicknames etc.
	 *
	 * @param {Object} data The data object that needs his fields and values validated
	 * @api private
	 */
	client.on( 'validate:check', function( data ){
		var field = '' + data.field
			, value = '' + data.value
			, temp
			, validates;
		
		if( field == 'nickname' ){
			if (value.length < 2 || value.length >= 24 ) return client.filter({type:"check:nickname", validates:false, message: value.length < 2 ? "Your nickname is to short" : "Your nickname is to long", field: field, value: value });
			
			temp = channel.users();
			validates = temp.indexOf( value ) === -1;
			client.filter({ type: 'check:nickname', validates: validates, message: validates ? false : 'This nickname is already taken', users: temp, field: field, value: value })
		}
	});
	
	/**
	 * The user have filled in all the details and wishes to 
	 * create a new account to join the chatbox \o/
	 *
	 * @param {Object} data The data used to create an account
	 * @api private
	 */
	client.on( 'account:create', function( data ){
		if (client.nickname) return false;
		
		// the account details are validating, so setup the actual account
		client.nickname = data.nickname;
		client.avatar = data.avatar;
		client.details.connected = new Date();
		
		// subscribe to a channel and notify the user
		channel.subscribe(client);
		channel.update(client);
		
		// announce that a new user has joined
		io.publish(client,client.rooms,channel.filter({type:"user:join", nickname:client.nickname, avatar:client.avatar, details:client.details }, client));
	});
});
/*
io.on("connection", function(client){
  
	// subscribe to a random channel.
	channel.subscribe(client);
	channel.update(client);
	client.details = {
		session: new Date
	};
	
	client.on("message", function(data){
		var tmp;
		if (data.type)
			switch (data.type){
			
				case "blacklist":
					channel.blacklist(data.blacklist, client);
					client.send(channel.filter({type:"notice", message:"Successfully blacklisted " + data.blacklist}, client));
					break;
					
				case "signup":
					break;
					
				case "private":
					channel.private(data,client);
					break;
				
				case "users":
					client.send(channel.filter({type:"users", data: channel.users() }, client));
					break;
					
				case "nick": case "nickname":
					if (!channel.nickname(data.nickname) || !data.nickname){
						data.nickname = data.nickname.trim();
						if (data.nickname.length < 2 || data.nickname.length > 24){
							client.send(channel.filter({type:"error", message: data.nickname.length < 2 ? "Your nickname is to short" : "Your nickname is to long", meta: "nick:invalid"}, client));
						} else {
							tmp = client.nickname;
							client.nickname = data.nickname;
							channel.update(client);
							
							if(tmp && client.rooms) io.publish(client,client.rooms,channel.filter({type:"update", meta: "nick:change", from: tmp, to: client.nickname}, client));
							else if(!tmp && client.rooms) io.publish(client,client.rooms,channel.filter({type:"update", meta:"user:join", nickname:client.nickname }, client));
						}
					} else {
						client.send(channel.filter({type:"error", message:"Nickname already taken"},client));
					}
					break;
					
				case "message":
					tmp = channel.filter(data, client);
					tmp.words = tmp.message.split( /\s+/g ).length;
					
					client.details.lines = client.details.lines ? client.details.lines + 1 : 1;
					client.details.words = client.details.words ? client.details.words + tmp.words : tmp.words;
					client.rooms && io.publish(client,client.rooms, tmp);
					break;
					
				default:
					console.log("fail");
			}
	});
	
	client.on("disconnect", function(){
		if (client.nickname && client.rooms)
			io.publish(client,client.rooms,channel.filter({type:"update", meta: "user:depart", nickname: client.nickname}, client));
			
		// remove the clients
		channel.unsubscribe(client);
	})
});
*/

/**
 * Create our room manager, and pass it a reference to our clients object.
 */
var channel = Manager(io);

app.listen(8908);
console.log("Listenering to post: " + 8908);