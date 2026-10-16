/* Monogatari v2.8.0 comparison scene. Not an adopted episode. */
"use strict";
/* global monogatari, Monogatari */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
monogatari.settings({
  Name: "kintoreapp-monogatari-prototype", Version: "0.1.0", Label: "Start",
  ShowMainScreen: false, LanguageSelectionScreen: false, MultiLanguage: false,
  Preload: false, AutoSave: 0, Slots: 0, ServiceWorkers: false,
  Screenshots: false, AllowRollback: false, Skip: 0,
  Orientation: "any", ForceAspectRatio: "None",
  TypeAnimation: !reduceMotion, InstantText: true,
  Storage: { Adapter: "SessionStorage", Store: "MonogatariPrototypeTemporary", Endpoint: "" },
  AssetsPath: {
    root: "/assets", characters: "shiori/gim/v1", scenes: "backgrounds",
    icons: "icons", images: "images", music: "music", sounds: "sounds",
    ui: "ui", videos: "videos", voices: "voices", gallery: "gallery"
  }
});
monogatari.preferences({ Language: "English", TextSpeed: 14 });
monogatari.assets("scenes", {
  gym_day: "gym-day.webp",
  gym_night: "gym-night.webp"
});
monogatari.characters({
  s: {
    name: "朝倉 栞",
    color: "#e5cffb",
    sprites: {
      normal: "shiori-home-training-bust-v1.webp"
      // Future expression images can be appended as more named sprites.
    }
  }
});
// Small CSS poses are Function actions inside Monogatari's native script.
function pose(mode) {
  return { Function: {
    Apply() {
      const img = document.querySelector('game-screen img[data-character="s"]');
      if (img) img.dataset.pose = mode;
      return true;
    },
    Revert() {
      const img = document.querySelector('game-screen img[data-character="s"]');
      if (img) delete img.dataset.pose;
    }
  } };
}
function completePrototype() {
  if (window.parent !== window) {
    window.parent.postMessage({ type: "kintore-monogatari-finished-v1" }, window.location.origin);
  }
  return true;
}
monogatari.script({
  Start: [
    "show scene gym_day with fadeIn",
    "show character s normal at center with fadeIn",
    "s あ、こんにちは。今日は少し動きを試してみてもいい？",
    "wait 450",
    "s まずは、こっちへ。",
    "show character s normal at left with move transition 650ms",
    "wait 300",
    "s うん。今度は反対側ね。",
    "show character s normal at right with move transition 650ms",
    "wait 300",
    "show character s normal at center with move transition 650ms",
    "s ちょっとだけ、近づいてみる。",
    pose("near"),
    "wait 350",
    "s ……近すぎたかな。",
    pose("far"),
    "wait 350",
    "s このくらいが話しやすい？",
    pose("tilt"),
    "wait 280",
    "s あ、首を傾げるのも試してるんだ。",
    pose(""),
    "s 次は背景。少し暗くなるよ。",
    "hide character s with fadeOut",
    "show scene gym_night with fadeIn",
    "wait 380",
    "show character s normal at center with fadeIn",
    "s 同じジムでも、夜は少し違って見えるね。",
    "show scene #15111e with fadeIn",
    "wait 480",
    "show scene gym_day with fadeIn",
    "show character s normal at center with fadeIn",
    "s 最後にひとつ聞いてもいい？",
    { Choice: {
      Dialog: "s どっちの動きが自然だった？",
      left: { Text: "左右に移動する動き", Do: "jump AnswerMove" },
      near: { Text: "少し近づく動き", Do: "jump AnswerNear" }
    } }
  ],
  AnswerMove: [
    "s そっか。位置が変わるだけでも印象が違うね。",
    "jump EndPrototype"
  ],
  AnswerNear: [
    "s なるほど。少しの距離でも変わるものだね。",
    "jump EndPrototype"
  ],
  EndPrototype: [
    "s ありがとう。今日はここまで。また話そうね。",
    completePrototype,
    "end"
  ]
});
Monogatari.$_ready(() => {
  monogatari.init("#monogatari").catch((err) => {
    console.error("Monogatari prototype init failed", err);
    document.getElementById("prototype-failure").hidden = false;
  });
});
