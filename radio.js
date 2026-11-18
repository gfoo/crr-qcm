"use strict";

// Radio message cards. Each line is a [French, English] pair; `c` is the visitor's boat
// (see radioContext in app.js) and `s` the situation picked on the card.
(() => {
  const MAYDAY3 = ["MAYDAY, MAYDAY, MAYDAY"];
  const ALL3 = ["À TOUS, À TOUS, À TOUS", "ALL STATIONS, ALL STATIONS, ALL STATIONS"];
  const THIS_IS = ["ICI", "THIS IS"];
  const OVER = ["À vous", "Over"];
  const OUT = ["Terminé", "Out"];
  const CALL_SIGN = (c) => [`Indicatif ${c.spelled.fr}`, `Call sign ${c.spelled.en}`];
  const CORMORAN_CALL_SIGN = ["Indicatif Foxtrot, X-Ray, Foxtrot, Alfa", "Call sign Foxtrot, X-Ray, Foxtrot, Alfa"];
  const IMMEDIATE_ASSISTANCE = ["Demandons assistance immédiate", "Require immediate assistance"];

  const DISTRESS = [
    {
      label: "Feu à bord",
      nature: ["Feu à bord", "Vessel on fire"],
      intent: () => ["Quittons le navire", "Leaving the vessel"],
      origin: "manual",
      source: "p. 20–21.",
    },
    {
      label: "Voie d’eau",
      nature: ["Voie d’eau", "Flooding"],
      intent: (c) => [c.staying.fr, c.staying.en],
      origin: "adapted",
      source: "structure p. 20–21, nature et intentions tirées du lexique p. 28 et 50.",
    },
    {
      label: "Homme à la mer",
      nature: ["Homme à la mer", "Man overboard"],
      origin: "adapted",
      source: "structure p. 20–21, nature tirée du lexique p. 28 et 50.",
    },
    {
      label: "Échouement",
      nature: ["Échouement", "Grounding"],
      intent: (c) => [c.staying.fr, c.staying.en],
      origin: "adapted",
      source: "structure p. 20–21, nature et intentions tirées du lexique p. 28 et 50.",
    },
    {
      label: "Chavirement",
      nature: ["Je risque de chavirer", "I am in danger of capsizing"],
      intent: () => ["Je vais abandonner le navire", "I will abandon vessel"],
      origin: "adapted",
      source: "structure p. 20–21, nature et intentions tirées du lexique p. 50.",
    },
    {
      label: "Navire qui coule",
      nature: ["Navire en train de couler", "Sinking"],
      intent: () => ["Je vais abandonner le navire", "I will abandon vessel"],
      origin: "adapted",
      source: "structure p. 20–21, nature et intentions tirées du lexique p. 50.",
    },
  ];

  window.CRR_RADIO = {
    example: {
      name: "THETYS",
      callSign: "FT9876",
      mmsi: "227132120",
      persons: "4",
      kind: "sail",
      hull: "white",
      positionMode: "relative",
      distance: "2",
      direction: "W",
      place: "Quiberon",
      latDeg: "43",
      latMin: "00",
      latSide: "N",
      lonDeg: "6",
      lonMin: "00",
      lonSide: "E",
    },
    phonetic: {
      A: "Alfa", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot", G: "Golf",
      H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima", M: "Mike", N: "November",
      O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango", U: "Uniform",
      V: "Victor", W: "Whiskey", X: "X-Ray", Y: "Yankee", Z: "Zulu",
    },
    digits: {
      fr: ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"],
      en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
    },
    kinds: {
      sail: { label: "Voilier", fr: "voilier", en: "yacht" },
      motor: { label: "Moteur", fr: "bateau à moteur", en: "motor yacht" },
    },
    hulls: {
      white: { fr: "blanche", en: "White" },
      blue: { fr: "bleue", en: "Blue" },
      red: { fr: "rouge", en: "Red" },
      black: { fr: "noire", en: "Black" },
      grey: { fr: "grise", en: "Grey" },
      green: { fr: "verte", en: "Green" },
      yellow: { fr: "jaune", en: "Yellow" },
    },
    positionModes: {
      relative: { label: "Par rapport à un point connu" },
      coordinates: { label: "Coordonnées" },
    },
    latitudeSides: {
      N: { fr: "Nord", en: "North" },
      S: { fr: "Sud", en: "South" },
    },
    longitudeSides: {
      E: { fr: "Est", en: "East" },
      W: { fr: "Ouest", en: "West" },
    },
    directions: {
      N: { fr: "Nord", en: "North" },
      NE: { fr: "Nord-Est", en: "North East" },
      E: { fr: "Est", en: "East" },
      SE: { fr: "Sud-Est", en: "South East" },
      S: { fr: "Sud", en: "South" },
      SW: { fr: "Sud-Ouest", en: "South West" },
      W: { fr: "Ouest", en: "West" },
      NW: { fr: "Nord-Ouest", en: "North West" },
    },
    origins: {
      manual: "Exemple du manuel",
      adapted: "Adapté du manuel",
      outside: "Hors manuel",
    },
    cards: [
      {
        id: "before",
        label: "Avant de parler",
        title: "Régler la VHF et prendre la parole",
        channel: "Voie 16",
        when: "Avant tout appel : de quoi entendre et être entendu.",
        steps: [
          "Allumez la VHF et placez-vous sur la voie 16.",
          "Réglez le volume.",
          "Squelch : baissez-le au minimum (on entend un souffle), remontez doucement jusqu’au silence complet, puis revenez légèrement en arrière.",
          "Pour parler, maintenez la touche PTT du combiné appuyée ; relâchez-la pour écouter.",
          "Gardez de quoi noter près de la VHF.",
        ],
        origin: "manual",
        source: "p. 18–19 pour les réglages, p. 21 pour noter, p. 20–23 pour « À vous » et « Terminé ».",
        blocks: () => [
          { label: "Fin d’un message, vous attendez une réponse", lines: [OVER] },
          { label: "Dernier message, sans réponse attendue", lines: [OUT] },
        ],
      },
      {
        id: "radio-check",
        label: "Essai radio",
        title: "Faire un essai radio",
        channel: "Voie 9 · Puissance réduite",
        when: "Vérifier que votre VHF émet et reçoit : on appelle une station, ici la capitainerie sur la voie 9, plutôt que d’encombrer la 16.",
        steps: [
          "Passez en puissance réduite : touche H/L, 1 watt.",
          "Écoutez d’abord : la voie doit être libre.",
          "Un appel bref, puis libérez la voie. Sur la 16, un essai doit rester rare, court et en puissance réduite.",
          "Avec une VHF ASN, vous pouvez aussi utiliser son test interne, ou un appel de routine individuel à une station dont vous connaissez le MMSI.",
        ],
        situations: [
          {
            label: "Fort et clair",
            report: ["Je vous reçois fort et clair", "I read you loud and clear"],
            origin: "outside",
            source: "« fort et clair / loud and clear » est l’usage courant, mais le manuel dit « 5 sur 5 » ; règles d’essai p. 19 et 36, voie 9 p. 10 ; « essai radio / radio check » est composé.",
          },
          {
            label: "5 sur 5",
            report: ["Je vous reçois très bien, 5 sur 5", "I read you excellent, five"],
            origin: "outside",
            source: "réponse tirée du lexique p. 51 ; règles d’essai p. 19 et 36, voie 9 p. 10 ; « essai radio / radio check » est composé.",
          },
          {
            label: "1 sur 5",
            report: ["Je vous reçois mal, 1 sur 5", "I read you bad, one"],
            origin: "outside",
            source: "réponse tirée du lexique p. 51 ; règles d’essai p. 19 et 36, voie 9 p. 10 ; « essai radio / radio check » est composé.",
          },
        ],
        blocks: (c, s) => [
          {
            label: "Vous appelez, voie 9",
            lines: [[`Capitainerie ${c.ofPlace}`, `${c.place} harbour master`], [`ICI ${c.name}`, `THIS IS ${c.name}`], ["Essai radio, me recevez-vous ?", "Radio check, do you read me?"], OVER],
          },
          {
            label: "La capitainerie répond",
            lines: [[c.name], [`ICI capitainerie ${c.ofPlace}`, `THIS IS ${c.place} harbour master`], s.report, OUT],
          },
        ],
      },
      {
        id: "mayday",
        label: "MAYDAY",
        title: "Appel et message de détresse",
        channel: "Voie 16 · Détresse",
        when: "Danger grave et imminent : il faut une aide immédiate. Répétez le message jusqu’à ce qu’une station réponde.",
        situations: DISTRESS,
        blocks: (c, s) => [
          {
            label: "Appel de détresse",
            lines: [MAYDAY3, THIS_IS, [c.name3], CALL_SIGN(c)],
          },
          {
            label: "Message de détresse",
            lines: [
              [`MAYDAY ${c.name} ${c.callSign}`],
              [c.position.fr, c.position.en],
              s.nature,
              IMMEDIATE_ASSISTANCE,
              [c.persons.fr, c.persons.en],
              ...(s.intent ? [s.intent(c)] : []),
              OVER,
            ],
          },
        ],
      },
      {
        id: "mayday-asn",
        label: "MAYDAY après ASN",
        title: "Message de détresse après une alerte ASN",
        channel: "Voie 16 · Détresse",
        when: "Vous avez envoyé l’alerte par ASN (touche DISTRESS) et reçu l’accusé de réception : passez sur la voie 16 et donnez les précisions. MAYDAY n’est dit qu’une fois.",
        situations: DISTRESS.map((situation) => ({
          ...situation,
          origin: "adapted",
          source: "exemple en français p. 32 ; l’anglais et la nature viennent du lexique p. 28 et 50.",
        })),
        blocks: (c, s) => [
          {
            label: "Message de détresse, voie 16",
            lines: [
              ["MAYDAY"],
              [`ICI ${c.kind.fr} ${c.name}`, `THIS IS ${c.kind.en} ${c.name}`],
              [`MMSI ${c.mmsi}`],
              CALL_SIGN(c),
              [`Position ${c.position.fr}`, `Position ${c.position.en}`],
              s.nature,
              IMMEDIATE_ASSISTANCE,
              [`${c.description.fr} – ${c.persons.fr}`, `${c.description.en} – ${c.persons.en}`],
              OVER,
            ],
          },
        ],
      },
      {
        id: "received-mayday",
        label: "Reçu MAYDAY",
        title: "Accuser réception d’un MAYDAY",
        channel: "Voie 16 · Détresse",
        when: "Vous entendez le MAYDAY de CORMORAN : cessez toute transmission, écoutez et notez le message. Si aucune station côtière n’a répondu dans un délai raisonnable, dites-lui qu’il a été entendu et que vous pouvez lui porter secours.",
        origin: "manual",
        source: "p. 21.",
        blocks: (c) => [
          {
            label: "Accusé de réception",
            lines: [
              ["MAYDAY"],
              ["CORMORAN Indicatif Foxtrot, X-Ray, Foxtrot, Alfa", "CORMORAN Call sign Foxtrot, X-Ray, Foxtrot, Alfa"],
              [`ICI ${c.name} indicatif ${c.spelled.fr}`, `THIS IS ${c.name} Call sign ${c.spelled.en}`],
              ["REÇU MAYDAY", "RECEIVED MAYDAY"],
            ],
          },
          {
            label: "Infos utiles",
            lines: [
              ["Suis à environ un mille au nord de votre position", "We are one mile away from you"],
              ["Serai sur zone dans 15 minutes environ", "We should arrive within 15 minutes"],
              OVER,
            ],
          },
        ],
      },
      {
        id: "mayday-relay",
        label: "MAYDAY RELAY",
        title: "Relayer un appel de détresse",
        channel: "Voie 16 · Détresse",
        when: "Le MAYDAY de CORMORAN n’a reçu aucun accusé de réception depuis cinq minutes, ou il ne peut pas joindre la côte : vous le relayez.",
        origin: "manual",
        source: "p. 22.",
        blocks: (c) => [
          {
            label: "Relais de détresse",
            lines: [
              ["MAYDAY RELAY, MAYDAY RELAY, MAYDAY RELAY"],
              ALL3,
              [`ICI ${c.name3}`, `THIS IS ${c.name3}`],
              CALL_SIGN(c),
              ["MAYDAY CORMORAN"],
              CORMORAN_CALL_SIGN,
            ],
          },
          {
            label: "Infos utiles",
            lines: [
              ["Deux milles Ouest Quiberon", "Two miles West of Quiberon"],
              ["Feu à bord", "Vessel on fire"],
              ["Équipage 5 personnes quitte le navire", "Five persons on board leaving the vessel"],
              OVER,
            ],
          },
        ],
      },
      {
        id: "pan-pan",
        label: "PAN PAN",
        title: "Appel et message d’urgence",
        channel: "Voie 16 · Urgence",
        when: "Le navire ou une personne a besoin d’aide sans danger immédiat : avarie, remorquage, blessé ou malade à bord.",
        situations: [
          {
            label: "Gouvernail cassé",
            lines: [["Gouvernail cassé, partons à la dérive", "Broken rudder, drifting"], ["Demandons remorquage", "Require tow"]],
            origin: "manual",
            source: "p. 23.",
          },
          {
            label: "Panne moteur",
            lines: [["J’ai des problèmes de machine", "I have problems with engine"], ["À la dérive", "Adrift"], ["Demandons remorquage", "Require tow"]],
            origin: "adapted",
            source: "structure p. 22–23, avarie tirée du lexique p. 50.",
          },
          {
            label: "Mât cassé",
            lines: [["Mât cassé", "Dismasted"], ["Demandons remorquage", "Require tow"]],
            origin: "outside",
            source: "structure p. 22–23 ; « Mât cassé / Dismasted » n’est pas dans le lexique du manuel.",
          },
          {
            label: "Blessé à bord",
            lines: [["Personne blessée à bord", "Injured person on board"], ["Demandons consultation radiomédicale", "Require radio medical advice"]],
            origin: "outside",
            source: "le manuel décrit la consultation radiomédicale (p. 23) sans en donner d’exemple ; « Injured person on board » n’est pas dans son lexique.",
          },
        ],
        blocks: (c, s) => [
          {
            label: "Appel d’urgence",
            lines: [["PAN PAN, PAN PAN, PAN PAN"], ALL3, [`ICI ${c.name3}`, `THIS IS ${c.name3}`], CALL_SIGN(c)],
          },
          {
            label: "Message d’urgence",
            lines: [
              [`Position ${c.position.fr}`, c.position.en],
              ...s.lines,
              [`${c.description.fr}, ${c.persons.fr}`, `${c.description.en}, ${c.persons.en}`],
              OVER,
            ],
          },
        ],
      },
      {
        id: "securite",
        label: "SÉCURITÉ",
        title: "Appel et message de sécurité",
        channel: "Voie 16 · Sécurité",
        when: "Un danger pour la navigation ou une météo dangereuse à signaler. Message court sur la 16, sinon annoncez une voie de dégagement.",
        situations: [
          {
            label: "Conteneur à la dérive",
            hazard: ["Conteneur à la dérive", "Container adrift"],
            origin: "manual",
            source: "p. 23, avec votre position.",
          },
          {
            label: "Bouée éteinte",
            hazard: ["Bouée éteinte", "Unlit buoy"],
            origin: "adapted",
            source: "structure p. 23, danger tiré du lexique p. 51.",
          },
          {
            label: "Épave dangereuse",
            hazard: ["Épave dangereuse", "Dangerous wreck"],
            origin: "adapted",
            source: "structure p. 23, danger tiré du lexique p. 51.",
          },
          {
            label: "Navire abandonné sans feu",
            hazard: ["Navire abandonné sans feu", "Derelict unlit vessel"],
            origin: "adapted",
            source: "structure p. 23, danger tiré du lexique p. 51.",
          },
          {
            label: "Filet à la dérive",
            hazard: ["Filet à la dérive", "Fishing net adrift"],
            origin: "outside",
            source: "structure p. 23 ; « Fishing net adrift » n’est pas dans le lexique du manuel.",
          },
        ],
        blocks: (c, s) => [
          {
            label: "Appel de sécurité",
            lines: [["SECURITE, SECURITE, SECURITE"], ALL3, [`ICI ${c.name3}`, `THIS IS ${c.name3}`], CALL_SIGN(c)],
          },
          {
            label: "Message de sécurité",
            lines: [[`${s.hazard[0]}, ${c.position.fr}`, `${s.hazard[1]}, ${c.position.en}`], OUT],
          },
        ],
      },
      {
        id: "false-alert",
        label: "Fausse alerte",
        title: "Annuler une fausse alerte de détresse",
        channel: "Voie 16",
        when: "Alerte de détresse déclenchée par erreur : annulez-la par ASN si l’appareil le permet, et dans tous les cas en phonie sur la 16. Restez ensuite quelques minutes à l’écoute.",
        origin: "manual",
        source: "p. 37 ; la date et l’heure sont celles de maintenant, en UTC.",
        blocks: (c) => [
          {
            label: "Annulation",
            lines: [
              ALL3,
              THIS_IS,
              [c.name3],
              CALL_SIGN(c),
              [`MMSI ${c.mmsi}`],
              [`Veuillez annuler mon alerte de détresse du ${c.utc.fr}`, `Please cancel my distress alert of ${c.utc.en}`],
            ],
          },
        ],
      },
      {
        id: "ship-call",
        label: "Appel navire",
        title: "Appeler un autre navire",
        channel: "Voie 16, puis 72",
        when: "Joindre un navire sans rendez-vous : appel bref sur la 16, puis on dégage sur une voie navire-navire (6, 8, 72 ou 77). Avec une VHF ASN, préférez un appel de routine ASN (voie 70).",
        origin: "adapted",
        source: "exemple en français p. 24 ; l’anglais vient du manuel p. 24 et du lexique p. 51, sauf « Hello ».",
        blocks: (c) => [
          {
            label: "Vous appelez, voie 16",
            lines: [["MARIE, MARIE"], [`ICI ${c.name}, ${c.name}`, `THIS IS ${c.name}, ${c.name}`], ["Me recevez-vous ?", "Do you read me?"], OVER],
          },
          {
            label: "MARIE répond, voie 16",
            lines: [[c.name], ["ICI MARIE", "THIS IS MARIE"], ["Bonjour", "Hello"], ["Dégagez voie 72", "Change to channel 72"], OVER],
          },
        ],
      },
      {
        id: "coast-station",
        label: "Station côtière",
        title: "Demander une liaison à une station côtière",
        channel: "Voie 16",
        when: "Correspondance publique, avec les quelques stations étrangères encore ouvertes : elle répond sur la 16 en donnant une voie de dégagement.",
        origin: "manual",
        source: "p. 24.",
        blocks: (c) => [
          {
            label: "Demande de liaison",
            lines: [["JERSEY RADIO, JERSEY RADIO, JERSEY RADIO"], THIS_IS, [c.name3], ["Me recevez-vous ?", "Do you read me?"]],
          },
        ],
      },
      {
        id: "harbour",
        label: "Capitainerie",
        title: "Annoncer son arrivée au port",
        channel: "Voie 9",
        when: "Demander une place en arrivant dans un port de plaisance : la voie 9 est la plus utilisée par les ports français.",
        origin: "outside",
        source: "aucun exemple dans le manuel. Voie 9 : p. 10 ; « Me recevez-vous ? » vient de la p. 24 et « Heure prévue d’arrivée / ETA » du lexique p. 51 ; le reste est composé.",
        blocks: (c) => [
          {
            label: "Vous appelez, voie 9",
            lines: [[`Capitainerie ${c.ofPlace}`, `${c.place} harbour master`], [`ICI ${c.name}`, `THIS IS ${c.name}`], ["Me recevez-vous ?", "Do you read me?"], OVER],
          },
          {
            label: "Votre demande",
            lines: [
              [`${c.description.fr}, ${c.persons.fr}`, `${c.description.en}, ${c.persons.en}`],
              ["Heure prévue d’arrivée 18 h 30", "ETA 18:30"],
              ["Demandons une place pour la nuit", "Request a berth for the night"],
              OVER,
            ],
          },
        ],
      },
    ],
  };
})();
