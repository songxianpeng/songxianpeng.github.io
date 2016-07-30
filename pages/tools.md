---
layout: page
title: 工具
description: 人越学越觉得自己无知
keywords: 软件, Tools
comments: false
menu: 软件
permalink: /tools/
---

> 磨刀不误砍柴工

<ul class="listing">
{% for tools in site.tools %}
{% if tools.title != "Tools Template" %}
<li class="listing-item"><a href="{{ tools.url }}">{{ tools.title }}</a></li>
{% endif %}
{% endfor %}
</ul>
