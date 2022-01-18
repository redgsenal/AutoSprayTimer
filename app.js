// app.js

/**
 * Rpi Board Configuration 
 */
const five = require("johnny-five");
const fs = require('fs');
const Raspi = require("raspi-io").RaspiIO;
const board = new five.Board({
  //repl: false,
  //debug: false,
  io: new Raspi()  
});
const exec = require('child_process').exec;

/**
* Connect peripherals and initialize
*/
board.on("ready", function() {
  // red led
  const pwrled = new five.Led("P1-13");// GPIO 27
  // yellow led
  const tmrled = new five.Led("P1-15");// GPIO 22
  // start button (green)
  const startbtn = new five.Button({
    pin: "P1-37",
    holdtime: 1000
  });// GPIO 26
  const testbtns = new five.Buttons({
    pins: ["P1-31", "P1-33", "P1-35"]
  });// GPIO 6, GPIO 13, GPIO 19
  
  const runningTimer = {
    startTime: null, 
    endTime: null, 
    currentTime: null, 
    isStart: false, 
    isPause: false, 
    timeLapse: function(){
      return this.currentTime - this.startTime;
    },
    duration: function(){
      return endTime - startTime;
    }
  };

  let timer = null;
  let offcount = 0;

  // relay (LEDs)
  const unitRelays = initRelays();
  
  function initRelays(){
    try {
      // power relays (red leds)
      var pr0 = new five.Led("P1-11");// GPIO 17
      var pr1 = new five.Led("P1-16");// GPIO 23
      var pr2 = new five.Led("P1-18");// GPIO 24

      // trigger relays (yellow led);
      var tr0 = new five.Led("P1-32");// GPIO 12
      var tr1 = new five.Led("P1-12");// GPIO 18
      var tr2 = new five.Led("P1-36");// GPIO 16

      return [
        {'power': pr0, 'trigger': tr0 }, 
        {'power': pr1, 'trigger': tr1 }, 
        {'power': pr2, 'trigger': tr2 }
      ];
    } catch(err){
      console.log('>>> error relay : ', err);
      process.exit(1);
    }
  }

  function readTimerData(){
    let rawdata = fs.readFileSync('/home/pi/Projects/glade/timerdata.json', 'utf8');
    let rtd = JSON.parse(rawdata);
    console.log('timer data from JSON file');
    rtd.forEach(data => {
      console.log('-------');
      console.log('relay: ', data['relay']);
      console.log('mark: ', data['mark']);
    });
    return rtd;
  }

  function triggerrelay(pin){
    console.log('trigger relay: ', pin);
    if (unitRelays && unitRelays.length > 0) {
      var unitRelay = unitRelays[pin];

      var power = unitRelay['power'];
      var trigger = unitRelay['trigger'];      

      power.on();
      setTimeout(function(){
        trigger.on();
        setTimeout(function(){
          trigger.off();
          setTimeout(function(){
            power.off();
          }, 1500);
        }, 3000);
      }, 1500);
    }
  }

  function stopRunningTime() {
    console.log('stop timer');
    clearInterval(timer);
    timer = null;
    tmrled.stop();
    tmrled.off();
    console.log('stop running timer');
  }

  function shutdown(){
    // call raspberry pi shutdown
    console.log('initate shutdown');
    pwrled.blink(100);
    tmrled.blink(100);
    setTimeout(function(){
      console.log('powering down...');
      pwrled.stop();
      tmrled.stop();
      pwrled.off();
      tmrled.off();
      //exec('shutdown now', function(error, stdout, stderr){ callback(stdout); });
    }, 10000);
  }

  function startRunningTime(){
    if (timer == null){
      runningTimer.isStart = true;
      runningTimer.isPause = false;
      runningTimer.startTime = new Date();
      tmrled.blink(1000);
      let timerdata = readTimerData();
      timer = setInterval(function(){
        runningTimer.currentTime = new Date();
        let diff = runningTimer.timeLapse();
        console.log('time lapse: ', runningTimer.timeLapse());

        let ss = diff / 1000;
        let cnt = 0;

        timerdata.forEach(data => {
          let relay = data['relay'];
          let mark = data['mark'];
          let triggered = data['triggered'];          
          let tsec = 60 * mark;          
          if ((ss > tsec) && !triggered) {
            console.log('time marked trigger relay: ', relay);
            triggerrelay(relay);
            data['triggered'] = true;
          }
          if (triggered){
            cnt++;
          }
          if (cnt == timerdata.length){
            console.log('cnt: ', cnt);
            console.log('timerdata.length: ', timerdata.length);
            stopRunningTime();
          }
        });
      }, 1000);
    }
  }
 
  // indicates the board is on and ready
  pwrled.on();
  console.log('board is ready');

  // "down" the button is pressed
  startbtn.on("down", function() {
    offcount = 0;
    console.log('button down');
  });

  // "hold" the button is pressed for specified time.
  // defaults to 500ms (1/2 second)  
  startbtn.on("hold", function() {
    console.log('start button hold...:', offcount);    
    if (offcount < 1){
      stopRunningTime();
      console.log('stop here');
    }
    if (offcount == 1){
      startRunningTime();
    }    
    if (offcount == 5){
      stopRunningTime();
      shutdown();
    } else {
      offcount++;
    }    
  });

  // "up" the button is released
  startbtn.on("up", function() {
    console.log("button up / release");    
    offcount = 0;    
  });

  testbtns.on("press", function(button) {
    console.log("Pressed: ", button.pin);
    let mpin = -1;
    if (button.pin == "P1-31"){
      mpin = 0;
    }
    if (button.pin == "P1-33"){
      mpin = 1;
    }
    if (button.pin == "P1-35"){
      mpin = 2;
    }
    triggerrelay(mpin);
  });

  testbtns.on("release", function(button) {
    console.log("Released: ", button.pin);
  });

  testbtns.on("hold", function(button) {
    console.log("Hold: ", button.pin);
  });

  board.on("fail", function(event) {
    /*
      Event {
        type: "info"|"warn"|"fail",
        timestamp: Time of event in milliseconds,
        class: name of relevant component class,
        message: message [+ ...detail]
      }
    */
    console.log("%s sent a 'fail' message: %s", event.class, event.message);    
  });

  board.on("exit", () => {
    console.log('board exiting');
    console.log('turn off relays');    
    tmrled.stop();
    tmrled.off();
    pwrled.stop();
    pwrled.off();
  });
});
