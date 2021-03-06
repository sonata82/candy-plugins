/** File: staticlobby.js
 * Candy Plugin Static Lobby Tab
 * Author: Melissa Adamaitis <melissa@melissanoelle.com>
 * Remember to include Strophe roster plugin!
 */

/* global Candy, jQuery, $msg */

var CandyShop = (function(self) { return self; }(CandyShop || {}));

CandyShop.StaticLobby = (function(self, Candy, $) {

  var usersInFakeLobby = {};

  /**
   * Initializes the Static Lobby plugin with the default settings.
   */
  self.init = function(){
    // Once we have a CONNECTED status from Strophe, ask for the global roster.
    $(Candy).on('candy:view.connection.status-5', function(){
      var lobbyFakeJid = self.getLobbyFakeJid();
      // Add the lobby room to the list of rooms so that other functions don't break looking for the room.
      if(!Candy.View.Pane.Chat.rooms[lobbyFakeJid]) {
        Candy.View.Pane.Room.init(lobbyFakeJid, 'Lobby', 'lobby');
        Candy.View.Pane.Chat.rooms[lobbyFakeJid].user = Candy.Core.getUser('me'); // Need to set the user of this room as ourselves to enable dropdown functionality for roster items.
      }
      Candy.View.Pane.Room.show(lobbyFakeJid);
      $('.roomtype-lobby .message-pane').remove();
      self.getGlobalRoster();
      return true;
    });

    // Add "Invite to..." context menu item.
    $(Candy).on('candy:view.roster.context-menu', function(ev, obj){
      obj.menulinks.invite = { class: 'invite',
                               label: 'Invite to...',
                               callback: function() { CandyShop.StaticLobby.inviteToModal(obj.roomJid, obj.user); }
                                };
    });

    $(Candy).on('candy:core.presence', self.updateUserInFakeLobby);
  };

  self.updateUserInFakeLobby = function (event, args) {
    var realJid = args.from,
        type = args.stanza.attr('type'),
        bareJid = Strophe.getBareJidFromJid(args.from),
        user = bareJid ? usersInFakeLobby[bareJid] : undefined;

    if (user !== undefined) {
      if (!type || type !== 'unavailable') {
        // update to latest realJid
        console.log('-----------------------------------------');
        user.data.realJid = realJid;
        user.setStatus('available');
        console.log(user);
        Candy.View.Pane.Roster.update(self.getLobbyFakeJid(), user, 'join', Candy.Core.getUser('me'));
      } else {
        console.log('*****************************************');
        console.log('user is unavailable');
        user.data.realJid = undefined;
        user.setStatus('unavailable');
        Candy.View.Pane.Roster.update(self.getLobbyFakeJid(), user, 'join', Candy.Core.getUser('me'));
      }
    }
  };

  self.addClickHandler = function (event, args) {
    var elem = args.element,
        userJid = args.user.getJid();

    if (args.roomJid === self.getLobbyFakeJid()) {
      if (args.action === 'join') {
        Candy.View.Pane.Roster.joinAnimation($(elem).attr('id'));

        console.log('adding click handler for', userJid);

        elem.unbind('click', Candy.View.Pane.Roster.userClick);          

        elem.click(self.userClick);
      }
    }
  };

  self.userClick = function () {
    var targetJid,
        e = $(this),
        realJid = e.attr('data-real-jid');

    if (realJid) {
      targetJid = Strophe.getBareJidFromJid(realJid);
      Candy.View.Pane.PrivateRoom.open(targetJid, e.attr('data-nick'), true, true);
    }
  }

  // Create a fake jid for the lobby so that other parts of candy don't fail on .replace() commands.
  self.getLobbyFakeJid = function(){
    if(!self.lobbyFakeJid) {
      var guid = (function() {
        function s4() {
          return Math.floor((1 + Math.random()) * 0x10000)
                     .toString(16)
                     .substring(1);
        }
        return function() {
          return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                 s4() + '-' + s4() + s4() + s4();
        };
      })();
      self.lobbyFakeJid = guid() + '@conference.' + Candy.Core.getConnection().domain;
    }
    return self.lobbyFakeJid;
  };

  // Request and parse global roster from server.
  self.getGlobalRoster = function(){
    Candy.Core.getConnection().roster.get(function(iq){
      for (var i = 0; i < iq.length; i++) {
        var user;
        try {
          var name = iq[i].name || iq[i].jid;
          user = new Candy.Core.ChatUser(iq[i].jid, name, 'member', 'participant');
        } catch(er) {
          console.log('Error creating candy core chatuser: ' + er.message);
        }
        try {
          Candy.View.Pane.Roster.update(self.getLobbyFakeJid(), user, 'join', Candy.Core.getUser('me'));
          usersInFakeLobby[iq[i].jid] = user;
        } catch(er) {
          console.log('Error updating lobby roster: ' + er.message);
        }

      }
      $(Candy).on('candy:view.roster.after-update', self.addClickHandler);
      return true;
    });
  };

  // Pops up a modal with available rooms to invite a user to.
  // TODO: only show rooms that a) I am allowed to invite to, and b) that a user is allowed to be invited to.
  self.inviteToModal = function(fromRoom, user) {
    var html = "<h5>Invite " + user.getNick() + " to...</h5><ul>";
    var rooms = Candy.Core.getRooms();
    for (var room in rooms) {
      html += '<li class="room-invite" onclick="CandyShop.StaticLobby.sendInviteStanza(\'' + user.data.jid + '\', \'' + room + '\')">' + rooms[room].getName() + '</li>';
    }
    html += "</ul>";
    Candy.View.Pane.Chat.Modal.show(html, true, false);
  };

  // Invites a user to a room.
  // TODO: implement reason.
  self.sendInviteStanza = function(toJid, roomJid) {
    // Create the message stanza using Strophe to invite a user to the room.
    var stanza = $msg({'from': Candy.Core.getUser('me').data.jid, 'to': toJid, 'xmlns': 'jabber:client'}).c('x', {'xmlns': 'jabber:x:conference', 'jid': roomJid});
    // Send the created stanza to the server.
    Candy.Core.getConnection().send(stanza.tree());
    // Close the modal now that we're done with it.
    Candy.View.Pane.Chat.Modal.hide();
    // Show the relevant chatroom.
    Candy.View.Pane.Room.show(roomJid);
  };

  return self;
}(CandyShop.StaticLobby || {}, Candy, jQuery));
