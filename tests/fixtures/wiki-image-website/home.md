---
title: Stick Man Test
layout: default.liquid
---

This is a stick man: ![[stick man.svg]]
This is a smaller stick man: ![[stick man.svg|100]]
Only the first number is significant: ![[stick man.svg|100x500]]
All stick men should be linked to "./stick man.svg", not "./figs/stick man.svg"
Relative link should work: ![[figs/square.png]]
Absolute link should work: ![[/figs/stick man.svg|200]]
Non-relative link should find the image: ![[square.png]]