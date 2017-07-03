---  
layout: post  
title: Servlet和JSP  
tags: Servlet JSP  
categories: JavaEE  
published: true  
---  

## Servlet

### 浏览器与服务器交互过程

![浏览器与服务器交互.png](/static/img/Servlet/浏览器与服务器交互.png "浏览器与服务器交互.png")

### Servlet调用过程


![Servlet调用.jpg](/static/img/Servlet/Servlet调用.jpg "Servlet调用.jpg")

Web服务器收到客户端的Servlet访问请求后：

1. Web服务器首先检查是否已经装载并创建了该Servlet的实例对象。如果是，则直接执行第4步，否则，执行第2步。
2. 装载并创建该Servlet的一个实例对象。 
3. 调用Servlet实例对象的init()方法。
4. 创建一个用于封装HTTP请求消息的HttpServletRequest对象和一个代表HTTP响应消息的HttpServletResponse对象，然后调用Servlet的service()方法并将请求和响应对象作为参数传递进去。
5. WEB应用程序被停止或重新启动之前，Servlet引擎将卸载Servlet，并在卸载之前调用Servlet的destroy()方法。 

### Servlet实现类

Servlet接口SUN公司定义了两个默认实现类，分别为：`GenericServlet`、`HttpServlet`。

* HttpServlet指能够处理HTTP请求的servlet，它在原有Servlet接口上添加了一些与HTTP协议处理方法，它比Servlet接口的功能更为强大。因此开发人员在编写Servlet时，通常应继承这个类，而避免直接去实现Servlet接口。
* HttpServlet在实现Servlet接口时，覆写了service方法，该方法体内的代码会自动判断用户的请求方式，如为GET请求，则调用HttpServlet的doGet方法，如为Post请求，则调用doPost方法。因此，开发人员在编写Servlet时，通常只需要覆写doGet或doPost方法，而不要去覆写service方法。

### Servlet映射

```xml
<web-app>
	<servlet>
		<servlet-name>AnyName</servlet-name>
		<servlet-class>HelloServlet</servlet-class>
	</servlet>
	<servlet-mapping>
		<servlet-name>AnyName</servlet-name>
		<url-pattern>/demo/hello.html</url-pattern>
		<!-- load-on-startup会在启动时就调用init方法而不是调用时候判断 -->
		<load-on-startup>2</load-on-startup>
	</servlet-mapping>
</web-app>
```

* 如果某个Servlet的映射路径仅仅为一个正斜杠（/），那么这个Servlet就成为当前Web应用程序的缺省Servlet。 
* 凡是在web.xml文件中找不到匹配的<servlet-mapping>元素的URL，它们的访问请求都将交给缺省Servlet处理，也就是说，缺省Servlet用于处理所有其他Servlet都不处理的访问请求。 
* 在<tomcat的安装目录>\conf\web.xml文件中，注册了一个名称为org.apache.catalina.servlets.DefaultServlet的Servlet，并将这个Servlet设置为了缺省Servlet。
* 当访问Tomcat服务器中的某个静态HTML文件和图片时，实际上是在访问这个缺省Servlet。 


#### 通配符匹配优先级

**对于如下的一些映射关系**

Servlet1 映射到 /abc/\*  
Servlet2 映射到 /\*  
Servlet3 映射到 /abc  
Servlet4 映射到 *.do  

**问题**

1. 当请求URL为“/abc/a.html”，“/abc/*”和“/*”都匹配，哪个servlet响应  
	*Servlet引擎将调用Servlet1。*  
2. 当请求URL为“/abc”时，“/abc/*”和“/abc”都匹配，哪个servlet响应  
	*Servlet引擎将调用Servlet3。*  
3. 当请求URL为“/abc/a.do”时，“/abc/*”和“*.do”都匹配，哪个servlet响应  
	*Servlet引擎将调用Servlet1。*  
4. 当请求URL为“/a.do”时，“/*”和“*.do”都匹配，哪个servlet响应  
	*Servlet引擎将调用Servlet2。*  
5. 当请求URL为“/xxx/yyy/a.do”时，“/*”和“*.do”都匹配，哪个servlet响应  
	*Servlet引擎将调用Servlet2。*  

*ps:题3、4、5证明\*在前面的匹配优先级最低*

### Servlet生命周期

* Servlet是一个供其他Java程序（Servlet引擎）调用的Java类，它不能独立运行，它的运行完全由Servlet引擎来控制和调度。
* 针对客户端的多次Servlet请求，通常情况下，服务器只会创建一个Servlet实例对象，也就是说Servlet实例对象一旦创建，它就会驻留在内存中，为后续的其它请求服务，直至web容器退出，servlet实例对象才会销毁。
* 在Servlet的整个生命周期内，Servlet的init方法只被调用一次。而对一个Servlet的每次访问请求都导致Servlet引擎调用一次servlet的service方法。对于每次访问请求，Servlet引擎都会创建一个新的HttpServletRequest请求对象和一个新的HttpServletResponse响应对象，然后将这两个对象作为参数传递给它调用的Servlet的service()方法，service方法再根据请求方式分别调用doXXX方法。 

### Servlet线程安全问题

Servlet是单例的，并发访问同一个Servlet时，web服务器会为每一个客户端的访问请求创建一个线程，并在这个线程上调用Servlet的service方法，因此service方法内如果访问了同一个资源的话，就有可能引发线程安全问题。

如果某个Servlet实现了SingleThreadModel接口，那么Servlet引擎将产生多个Servlet实例对象给每个线程来调用其service方法。

对于实现了SingleThreadModel接口的Servlet，Servlet引擎仍然支持对该Servlet的多线程并发访问，其采用的方式是**产生多个Servlet实例对象**，并发的每个线程分别调用一个独立的Servlet实例对象。

实现SingleThreadModel接口并不能真正解决Servlet的线程安全问题，因为Servlet引擎会创建多个Servlet实例对象，而真正意义上解决多线程安全问题是指一个Servlet实例对象被多个线程同时调用的问题。事实上，在Servlet API 2.4中，已经将SingleThreadModel标记为Deprecated（过时的）。   

### ServletConfig

当servlet配置了初始化参数后，web容器在创建servlet实例对象时，会自动将这些初始化参数封装到ServletConfig对象中，并在调用servlet的init方法时，将ServletConfig对象传递给servlet。进而，程序员通过ServletConfig对象就可以得到当前servlet的初始化参数信息。

**作用**

* 获得字符集编码
* 获得数据库连接信息
* 获得配置文件，查看struts案例的web.xml文件


```java
public void init(ServletConfig config) throws ServletException {
	this.config = config;
	this.init();
}
```

```java
String value = this.getServletConfig().getInitValue("config");
```

```xml
<servlet>
	<servlet-name>action</servlet-name>
	<servlet-class>org.apache.struts.action.ActionServlet</servlet-class>
	<init-param>
		<param-name>config</param-name>
		<param-value>
			/WEB-INF/struts-config.xml,
			/WEB-INF/struts-config-portal.xml
		</param-value>
	</init-param>
	<load-on-startup>2</load-on-startup>
</servlet>

<!-- Standard Action Servlet Mapping -->
<servlet-mapping>
	<servlet-name>action</servlet-name>
	<url-pattern>*.do</url-pattern>
</servlet-mapping>
```
### ServletContext

WEB容器在启动时，它会为每个WEB应用程序都创建一个对应的ServletContext对象，它代表当前web应用。

ServletConfig对象中维护了ServletContext对象的引用，开发人员在编写servlet时，可以通过ServletConfig.getServletContext()方法获得ServletContext对象

#### ServletContext应用

* 多个servlet通过servletContext实现数据共享

```java
ServletContext context = this.getServletConfig().getServletContext();
context.setAttribute("data", data);  //map
```

```java
ServletContext context = this.getServletContext();
String data = (String) context.getAttribute("data");
```

* 获取整个web站点的初始化参数

```xml
<web-app>
<context-param>
	<param-name>url</param-name>
	<param-value>jdbc:mysql://localhost:3306/test</param-value>
</context-param>
</web-app>
```

```java
ServletContext context = this.getServletContext();
String url = context.getInitParameter("url");
```

* 用servletContext实现请求转发
	- 转发之前的所有写入都无效
	- 转发之前，response不能提交，否则转发的时候服务器会抛：Cannot forward after response has been committed

```java
ServletContext context = this.getServletContext();
RequestDispatcher rd = context.getRequestDispatcher("/servlet/xpress");
rd.forward(request, response);  //doget()
```

* 用servletContext读取资源文件

```java
// String path = this.getServletContext().getRealPath("/WEB-INF/classes/db.properties");
// FileInputStream in = new FileInputStream(path);

InputStream in = this.getServletContext().getResourceAsStream("/WEB-INF/classes/db.properties");
Properties prop = new Properties();
prop.load(in);

Properties prop = new Properties();
prop.load(in);

String driver = prop.getProperty("driver");
```

## JSP

### JSP运行原理

* 每个JSP 页面在第一次被访问时，WEB容器都会把请求交给JSP引擎（即一个Java程序）去处理。JSP引擎先将JSP翻译成一个_jspServlet(实质上也是一个servlet) ，然后按照servlet的调用方式进行调用。
* 由于JSP第一次访问时会翻译成servlet，所以第一次访问通常会比较慢，但第二次访问，JSP引擎如果发现JSP没有变化，就不再翻译，而是直接调用，所以程序的执行效率不会受到影响。

### JSP语法

#### JSP模版元素

JSP页面中的HTML内容称之为JSP模版元素

#### JSP表达式

JSP脚本表达式（expression）用于将程序数据输出到客户端

语法：
```jsp
:<%= new java.util.Date() %> 
```

*JSP引擎在翻译脚本表达式时，会将程序数据转成字符串，然后在相应位置用out.print(…) 将数据输给客户端。*  
*JSP脚本表达式中的变量或表达式后面`不能有分号`*

#### JSP脚本片断

JSP脚本片断（scriptlet）用于在JSP页面中编写多行Java代码

语法：

```jsp
<%
	for (int i=1; i<5; i++) 
	{
%>

	<H1>www.it315.org</H1>

<%
	}
%> 
```


*JSP引擎在翻译JSP页面中，会将JSP脚本片断中的Java代码将被原封不动地放到Servlet的_jspService方法中*

**JSP声明**

语法：

```jsp
<%!
	static 
	{ 
		System.out.println("loading Servlet!"); 
	}
	private int globalVar = 0;
	public void jspInit()
	{
		System.out.println("initializing jsp!");
	}
%>
<%!
	public void jspDestroy()
	{
		System.out.println("destroying jsp!");
	}
%>

```

*JSP页面中编写的所有代码，默认会翻译到servlet的service方法中， 而Jsp声明中的java代码被翻译到_jspService方法的外面。*

#### JSP注释

语法：

```jsp
<%-- 注释信息 --%>
```

*JSP引擎在将JSP页面翻译成Servlet程序时，忽略JSP页面中被注释的内容。*

#### JSP指令

JSP指令（directive）是为JSP引擎而设计的，它们并不直接产生任何可见输出，而只是告诉引擎如何处理JSP页面中的其余部分

* page指令

page指令用于定义JSP页面的各种属性，无论page指令出现在JSP页面中的什么地方，它作用的都是整个JSP页面

```jsp

<%@ page contentType="text/html;charset=UTF-8" language="java" pageEncoding="utf-8" %>
<%@ page import="java.util.Date"%>
<%--写在一个指令中--%>
<%@ page contentType="text/html;charset=UTF-8" import="java.util.Date"%> 
```
**Jsp乱码问题**

1. page指令的pageEncoding属性说明JSP源文件的字符集编码  
	JSP引擎将JSP源文件翻译成的Servlet源文件默认采用UTF-8编码，而JSP开发人员可以采用各种字符集编码来编写JSP源文件，因此，JSP引擎将JSP源文件翻译成Servlet源文件时，需要进行字符编码转换。 
2. 通过page指令的contentType属性说明JSP源文件的字符集编码  
	输出响应正文时出现的中文乱码问题 

JSP 引擎自动导入下面的包：

```java
import java.lang.*;
import javax.servlet.*;
import javax.servlet.jsp.*;
import javax.servlet.http.*;
```

* `include指令`

`include指令`用于引入其它JSP页面，如果使用`include指令`引入了其它JSP页面，那么JSP引擎将把这两个JSP翻译成一个servlet。所以`include指令`引入通常也称之为静态引入。

```jsp
<%@ include file="/index.jsp"%>
```

* taglib指令

taglib指令用于在JSP页面中导入标签库

#### JSP内置对象

JSP引擎在调用JSP对应的_jspServlet时，会传递或创建9个与web开发相关的对象供_jspServlet使用。JSP技术的设计者为便于开发人员在编写JSP页面时获得这些web对象的引用，特意定义了9个相应的变量，开发人员在JSP页面中通过这些变量就可以快速获得这9大对象的引用。

* request
* response
* session
* application(servletContext)
* config(servletConfig)
* page(this)
* out(jspWriter)
* pageContext
* exception

##### out对象

out隐式对象的工作原理图 

![out对象工作原理.png](/static/img/Servlet/out对象工作原理.png "out对象工作原理.png")

**同时使用out和response.getwriter()输出数据问题**

```java
out.write("1");
response.getWriter().write("2");
// 由于out有缓冲区所以输出到页面的结果是21
```

只有向out对象中写入了内容，且满足如下任何一个条件时，out对象才去调用ServletResponse.getWriter方法，并通过该方法返回的PrintWriter对象将out对象的缓冲区中的内容真正写入到Servlet引擎提供的缓冲区中：

* 设置page指令的buffer属性关闭了out对象的缓存功能
* out对象的缓冲区已满
* 整个JSP页面结束

##### pageContext对象

pageContext对象是JSP技术中最重要的一个对象，它代表JSP页面的运行环境，这个对象不仅封装了对其它8大隐式对象的引用，它自身还是一个域对象，可以用来保存数据。并且，这个对象还封装了web开发中经常涉及到的一些常用操作，例如引入和跳转其它资源、检索其它域对象中的属性等。 

* getException() 返回exception隐式对象 
* getPage() 返回page隐式对象
* getRequest() 返回request隐式对象 
* getResponse() 返回response隐式对象 
* getServletConfig() 返回config隐式对象
* getServletContext() 返回application隐式对象
* getSession() 返回session隐式对象 
* getOut() 返回out隐式对象

作为域对象:

* 访问pageContext域
	- setAttribute(String name,Object value)
	- getAttribute(String name)
	- removeAttribute(String name)
* 访问其它域的方法
	- getAttribute(String name,int scope)
	- setAttribute(String name, Object value,int scope)
	- removeAttribute(String name,int scope)
	- 代表各个域的常量
		+ PageContext.APPLICATION_SCOPE
		+ PageContext.SESSION_SCOPE
		+ PageContext.REQUEST_SCOPE
		+ PageContext.PAGE_SCOPE 
* **findAttribute()  pageContext-request-session-application （*重点，查找各个域中的属性） EL表达式**
* pageContext类中定义了一个forward方法和两个include方法来分别简化和替代req.getRequestDispatcher("/").forward(req,resp);方法和include方法。

#### JSP标签

JSP标签也称之为Jsp Action(JSP动作)元素，它用于在Jsp页面中提供业务逻辑功能，避免在JSP页面中直接编写java代码，造成jsp页面难以维护。

##### 常用标签

* `<jsp:include>`标签  
* `<jsp:forward>`标签  
* `<jsp:param>`标签  

```jsp
<jsp:include page="relativeURL | <%=expression%>">
		<jsp:param name="parameterName" value="parameterValue|<%= expression %>" />
	</jsp:include>

<jsp:forward page="relativeURL | <%=expression%>">
	<jsp:param name="parameterName" value="parameterValue|<%= expression %>" />
	<jsp:param name="parameterName1" value="parameterValue1|<%= expression1 %>" />
</jsp:include>
```

**`<jsp:include>`与`include指令`的比较 **

`<jsp:include>`标签是动态引入， `<jsp:include>`标签涉及到的2个JSP页面会被翻译成2个servlet，这2个servlet的内容在执行时进行合并。
而`include指令`是静态引入，涉及到的2个JSP页面会被翻译成一个servlet，其内容是在源文件级别进行合并。  
不管是`<jsp:include>`标签，还是`include指令`，它们都会把两个JSP页面内容合并输出，所以这两个页面不要出现重复的HTML全局架构标签，否则输出给客户端的内容将会是一个格式混乱的HTML文档。


### JSP映射

```xml
<servlet>
	<servlet-name>SimpleJspServlet</servlet-name>
	<jsp-file>/jsp/simple.jsp</jsp-file>
	<load-on-startup>1</load-on-startup >
</servlet>
<servlet-mapping>
	<servlet-name>SimpleJspServlet</servlet-name>
	<url-pattern>/xxx/yyy.html</url-pattern>
</servlet-mapping>
```

## 域对象

* pageContext（page域） 
* request（request域）
* session（session域）
* servletContext（application域）

----------

*以上概念总结于传智播客JavaWeb课程*