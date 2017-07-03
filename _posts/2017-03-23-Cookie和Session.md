---  
layout: post  
title: Cookie和Session  
tags: Cookie Session  
categories: JavaEE  
published: true  
---  


## 会话

会话可简单理解为：用户开一个浏览器，点击多个超链接，访问服务器多个web资源，然后关闭浏览器，整个过程称之为一个会话。

## Cookie

Cookie是客户端技术，程序把每个用户的数据以cookie的形式写给用户各自的浏览器。当用户使用浏览器再去访问服务器中的web资源时，就会带着各自的数据去。这样，web资源处理的就是用户各自的数据了。

### Cookie操作

```java
//得到上次访问时间
Cookie cookies[] = request.getCookies();
for(int i=0;cookies!=null && i<cookies.length;i++){
	Cookie cookie = cookies[i];
	if(cookie.getName().equals("lastAccessTime")){
		Long time = Long.parseLong(cookie.getValue());
		Date d = new Date(time);
	}
}
//给用户以cookie的形式送最新的时间
Cookie cookie = new Cookie("lastAccessTime",System.currentTimeMillis()+"");
cookie.setMaxAge(10000);// 0为删除
cookie.setPath("/xpress");

response.addCookie(cookie);
```

### Cookie细节

* 浏览器一般只允许存放300个Cookie，每个站点最多存放20个Cookie，每个Cookie的大小限制为4KB
* 如果创建了一个cookie，并将他发送到浏览器，默认情况下它是一个会话级别的cookie（即存储在浏览器的内存中），用户退出浏览器之后即被删除。若希望浏览器将该cookie存储在磁盘上，则需要使用maxAge，并给出一个以秒为单位的时间。将最大时效设为0则是命令浏览器删除该cookie
* 删除cookie时，path必须一致，否则不会删除

## Session

Session是服务器端技术，利用这个技术，服务器在运行时可以为每一个用户的浏览器创建一个其`独享的session对象`，由于session为用户浏览器独享，所以用户在访问服务器的web资源时，可以把各自的数据放在各自的session中，当用户再去访问服务器中的其它web资源时，其它web资源再从用户各自的session中取出数据为用户服务。

### Session操作

```java
HttpSession session = request.getSession();
session.setAttribute("data", "xpress");

System.out.println(session.getAttribute("data"));
```

### 禁用Cookie后的Session处理

**解决方案：URL重写**

* response. encodeRedirectURL(java.lang.String url) 
	- 用于对sendRedirect方法后的url地址进行重写。
* response. encodeURL(java.lang.String url)
	- 用于对表单action和超链接的url地址进行重写 

```java
//request.getRequestDispatcher("/servlet/ListCartServlet").forward(request, response);

String url = response.encodeRedirectURL("/xpress/servlet/ListCartServlet");// 这里获得拼接了sessionid的url
// /xpress/servlet/ListCartServlet;jsessionid=S8DF7AS8D7F8A7S9D7FAS9DF7?id=4
response.sendRedirect(url);
```

### Session细节

**1. 服务器是如何做到一个session为一个浏览器的多次请求而服务**

服务器创建session出来后，会把 session的id号，以cookie的形式回写给客户机，这样，只要客户机的浏览器不关，再去访问服务器时，都会带着session 的id号去，服务器发现客户机带session id过来了，就会使用内存中与之对应的session为之服务

**2. 如何做到一个session为多个浏览器窗口服务**

服务器第一次创建session，程序员把session id号，手工以cookie的形式回送给浏览器，并设置cookie的有效期，这样，即使用户的浏览器关了，开新浏览器时，还会带着session id找服务器，服务器从而就可以用内存中与之对应的session为第二个浏览器窗口服务

**3. 如何做用户禁用cookie后，session还能为多次请求而服务**

把用户可能点的每一个超链接后面，都跟上用户的session id号

**4. session对象的创建和销毁时机**

* 用户第一次request.getSession()时创建
* session对象默认30分钟没有使用，则服务器会自动销毁Session
	- 用户在web.xml文件中手工配置Session的失效时间
	- 用户可以手工调用session.invalidate()方法，摧毁Session

## Session和Cookie的区别

* Cookie是把用户的数据写给用户的浏览器
* Session技术把用户的数据写到服务器的用户独占session中

----------

*以上概念总结于传智播客JavaWeb课程*