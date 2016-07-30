---
layout: page
title: Wiki
description: 人越学越觉得自己无知
keywords: 软件, Tools
comments: false
menu: 软件
permalink: /wiki/
---

> 磨刀不误砍柴工

<ul class="listing">
{% for wiki in site.wiki %}
{% if wiki.title != "Wiki Template" %}
<li class="listing-item"><a href="{{ wiki.url }}">{{ wiki.title }}</a></li>
{% endif %}
{% endfor %}
</ul>
