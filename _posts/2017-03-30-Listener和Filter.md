---  
layout: post  
title: Listener和Filter  
tags: Listener Filter  
categories: JavaEE  
published: true  
---  

## Listener

* 域对象操作监听器 要在web.xml中注册
* HttpSessionBindingListener 不需要在web.xml中注册，和指定（实现了接口的）JavaBean绑定。
* HttpSessionActivationListener 不需要在web.xml中注册。监听的是指定的JavaBean在Session中的钝化和活化事件。

### 域对象操作监听器

* requset
    - ServletRequestListener 监听请求的创建（请求到达服务器）和销毁（响应结束之后）（适合监视用户的访问记录）
    - ServletRequestAttributeListener （added removed replaced）
* session
    - HttpSessionListener 监听Session的创建(getSession方法才创建Session)和销毁（适合粗粒度的视用户在网站是否在线）
        + 销毁时机
            * 1、过期。
            * 2、手动调用session.invalidate()方法。
            * 3、服务器非正常关闭）。
    - HttpSessionAttributeListener （added removed replaced）
* application
    - ServletContextListener 服务器的启动与停止（适合初始化和回收资源）
    - ServletContextAttributeListener （added removed replaced）


#### ServletRequestListener

监听request创建和销毁

#### 是否会响应事件

* html:会
* jsp:会
* servlet:会

```java
public interface ServletRequestListener extends EventListener {
    /* Receives notification that a ServletRequest is about to go out of scope of the web application.*/
    public void requestDestroyed(ServletRequestEvent sre);
    /* Receives notification that a ServletRequest is about to come into scope of the web application. */
    public void requestInitialized(ServletRequestEvent sre);
}

public class ServletRequestEvent extends java.util.EventObject { 
    public ServletRequestEvent(ServletContext sc, ServletRequest request) {
        super(sc);
        this.request = request;
    }
    /*  Returns the ServletRequest that is changing.*/
    public ServletRequest getServletRequest () { 
        return this.request;
    }
    /* Returns the ServletContext of this web application.*/
    public ServletContext getServletContext () { 
        return (ServletContext) super.getSource();
    }
}
```

#### ServletRequestAttributeListener

监听request域的新增修改和删除

```java
public interface ServletRequestAttributeListener extends EventListener {
    /* Receives notification that an attribute has been added to the ServletRequest.*/
    public void attributeAdded(ServletRequestAttributeEvent srae);

    /* Receives notification that an attribute has been removed from the ServletRequest.*/
    public void attributeRemoved(ServletRequestAttributeEvent srae);

    /* Receives notification that an attribute has been replaced on the ServletRequest.*/
    public void attributeReplaced(ServletRequestAttributeEvent srae);
}

public class ServletRequestAttributeEvent extends ServletRequestEvent { 
    private String name;
    private Object value;
    public ServletRequestAttributeEvent(ServletContext sc, ServletRequest request, String name, Object value) {
        super(sc, request);
        this.name = name;
        this.value = value;
    }
    /* Return the name of the attribute that changed on the ServletRequest.*/
    public String getName() {
        return this.name;
    }
    /**
      * Returns the value of the attribute that has been added, removed or 
      * replaced. If the attribute was added, this is the value of the 
      * attribute. If the attribute was removed, this is the value of the 
      * removed attribute. If the attribute was replaced, this is the old 
      * value of the attribute.
      */
    public Object getValue() {
        return this.value;   
    }
}
```

#### HttpSessionListener

监听session的创建和销毁

#### 是否会响应事件

* html:不会
* jsp:会（在生成Session内置对象进会自动调用getSession，所以会产生Session，会被监听器监听到事件的发生）
* servlet:不一定（取决于程序员是否调用了getSession方法）

```java
public interface HttpSessionListener extends EventListener {
    /** 
     * Receives notification that a session has been created.
     */
    public void sessionCreated(HttpSessionEvent se);
    /** 
     * Receives notification that a session is about to be invalidated.
     */
    public void sessionDestroyed(HttpSessionEvent se);
}

public class HttpSessionEvent extends java.util.EventObject {

    public HttpSessionEvent(HttpSession source) {
        super(source);
    }
    /**
     * Return the session that changed.
     */
    public HttpSession getSession () { 
        return (HttpSession) super.getSource();
    }
}
```

#### HttpSessionAttributeListener

监听session域的新增修改和删除

```java
public interface HttpSessionAttributeListener extends EventListener {
    // Receives notification that an attribute has been added to a session.
    public void attributeAdded(HttpSessionBindingEvent event);
    // Receives notification that an attribute has been removed from a session.
    public void attributeRemoved(HttpSessionBindingEvent event);
    // Receives notification that an attribute has been replaced in a session.
    public void attributeReplaced(HttpSessionBindingEvent event);
}

public class HttpSessionBindingEvent extends HttpSessionEvent {
    /* The name to which the object is being bound or unbound */
    private String name;
    /* The object is being bound or unbound */
    private Object value;

    public HttpSessionBindingEvent(HttpSession session, String name, Object value) {
        super(session);
        this.name = name;
        this.value = value;
    }
    @Override
    public HttpSession getSession () { 
        return super.getSession();
    }
    /* Returns the name with which the attribute is bound to or unbound from the session.*/
    public String getName() {
        return name;
    }
    /**
     * Returns the value of the attribute that has been added, removed or
     * replaced. If the attribute was added (or bound), this is the value of the
     * attribute. If the attribute was removed (or unbound), this is the value
     * of the removed attribute. If the attribute was replaced, this is the old
     * value of the attribute.
     */
    public Object getValue() {
        return this.value;   
    }
}
```

#### ServletContextListener

监听application的创建和销毁

```java
public interface ServletContextListener extends EventListener {
    /* Receives notification that the web application initialization process is starting.*/
    public void contextInitialized(ServletContextEvent sce);
    /*  Receives notification that the ServletContext is about to be shut down.*/
    public void contextDestroyed(ServletContextEvent sce);
}

public class ServletContextEvent extends java.util.EventObject { 
    public ServletContextEvent(ServletContext source) {
        super(source);
    }
    /* Return the ServletContext that changed.*/
    public ServletContext getServletContext () { 
        return (ServletContext) super.getSource();
    }
}
```

#### ServletContextAttributeListener

监听application域的新增修改和删除

```java
public interface ServletContextAttributeListener extends EventListener {
    /*  Receives notification that an attribute has been added to the ServletContext. */
    public void attributeAdded(ServletContextAttributeEvent event);
    /* Receives notification that an attribute has been removed from the ServletContext */
    public void attributeRemoved(ServletContextAttributeEvent event);
    /*  Receives notification that an attribute has been replaced in the ServletContext.*/
    public void attributeReplaced(ServletContextAttributeEvent event);
}

public class ServletContextAttributeEvent extends ServletContextEvent { 
    private String name;
    private Object value;

    /* Constructs a ServletContextAttributeEvent from the given  ServletContext, attribute name, and attribute value. */
    public ServletContextAttributeEvent(ServletContext source,
            String name, Object value) {
        super(source);
        this.name = name;
        this.value = value;
    }
    /* Gets the name of the ServletContext attribute that changed. */
    public String getName() {
        return this.name;
    }
    /*  Gets the value of the ServletContext attribute that changed. */
    public Object getValue() {
        return this.value;   
    }
}
```

### HttpSessionBindingListener

HttpSessionBindingListener是一个监听器接口，用于监听JavaBean对象绑定到HttpSession对象和从HttpSession对象解绑的事件。  
该接口中共定义了两个事件处理方法，分别是valueBound()方法和valueUnbound()方法。  

* public void valueBound(HttpSessionBindingEvent event)                  
    - 当对象被绑定到HttpSession对象中，Web容器将调用对象的valueBound()方法并传递一个HttpSessionBindingEvent类型的事件对象，程序可以通过这个事件对象来获得将要绑定到的HttpSession对象。
* public void valueUnbound(HttpSessionBindingEvent event)                 
    - 当对象从HttpSession对象中解除绑定时，Web容器同样将调用对象的valueUnbound()方法并传递一个HttpSessionBindingEvent类型的事件对象。

```java
public class User implements HttpSessionBindingListener {
    private String username;
    private String password;
    private String id;
    public String getUsername() {
        return username;
    }
    public void setUsername(String username) {
        this.username = username;
    }
    public String getPassword() {
        return password;
    }
    public void setPassword(String password) {
        this.password = password;
    }
    public String getId() {
        return id;
    }
    public void setId(String id) {
        this.id = id;
    }
    public void valueBound(HttpSessionBindingEvent event) {
        // 将user存入列表
        OnlineUser.getInstance().addUser(this);
    }
    public void valueUnbound(HttpSessionBindingEvent event) {
        OnlineUser.getInstance().removeUser(this);
    }
}

public class HttpSessionBindingEvent extends HttpSessionEvent {
    /* The name to which the object is being bound or unbound */
    private String name;
    /* The object is being bound or unbound */
    private Object value;
    public HttpSessionBindingEvent(HttpSession session, String name, Object value) {
        super(session);
        this.name = name;
        this.value = value;
    }
    /** Return the session that changed. */
    @Override
    public HttpSession getSession () { 
        return super.getSession();
    }
    /* Returns the name with which the attribute is bound to or unbound from the session.*/
    public String getName() {
        return name;
    }
    /**
     * Returns the value of the attribute that has been added, removed or
     * replaced. If the attribute was added (or bound), this is the value of the
     * attribute. If the attribute was removed (or unbound), this is the value
     * of the removed attribute. If the attribute was replaced, this is the old
     * value of the attribute.
     */
    public Object getValue() {
        return this.value;   
    }
}
```

### HttpSessionActivationListener

主要用于监听对象在Session中保存后，随着服务器的正常关闭和启动，与Session一起被钝化和活化的事件。  

```java
public interface HttpSessionActivationListener extends EventListener { 
    /** Notification that the session is about to be passivated.*/
    public void sessionWillPassivate(HttpSessionEvent se); 
    /** Notification that the session has just been activated.*/
    public void sessionDidActivate(HttpSessionEvent se);
}

public class HttpSessionEvent extends java.util.EventObject {
    /* Construct a session event from the given source.*/
    public HttpSessionEvent(HttpSession source) {
        super(source);
    }
    /* Return the session that changed.*/
    public HttpSession getSession () { 
        return (HttpSession) super.getSource();
    }
}
```

### SessionAttributeListener和HttpSessionBindingListener的区别

* SessionAttributeListener：需创建一个类，实现监听器接口，并在web.xml中注册监听器。监听Session中的所有属性的变化事件（不论属性对象类型）。
* HttpSessionBindingListener：只需要被绑定的JavaBean实现接口，不需要在web.xml中注册。只监听实现了接口的JavaBean对象在Session中的添加(valueBound)和删除(valueUnbound)事件

### Listener配置

```xml
<listener>
    <listener-class>com.xpress.litener.MyListener</listener-class>
</listener>
```

## Filter

在一组资源的前面执行，可以控制请求是否达到目标资源

Filter是单例的

### Filter接口

```java
public interface Filter {

    /** 
     * Called by the web container to indicate to a filter that it is
     * being placed into service.服务器启动时创建，创建之后执行
     */
    public void init(FilterConfig filterConfig) throws ServletException;
    
    /**
     * The doFilter method of the Filter is called by the
     * container each time a request/response pair is passed through the
     * chain due to a client request for a resource at the end of the chain.
     * The FilterChain passed in to this method allows the Filter to pass
     * on the request and response to the next entity in the chain.每次过滤都执行
     */
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException;
    /**
     * Called by the web container to indicate to a filter that it is being
     * taken out of service.销毁之前执行，服务器关闭时
     */
    public void destroy();
}

public interface FilterConfig {
    /* Returns the filter-name of this filter as defined in the deployment descriptor. */
    public String getFilterName();
    /*  Returns a reference to the {@link ServletContext} in which the caller is executing.*/
    public ServletContext getServletContext();
    /**
     * Returns a String containing the value of the 
     * named initialization parameter, or null if 
     * the initialization parameter does not exist.
     */
    public String getInitParameter(String name);
    /**
     * Returns the names of the filter's initialization parameters
     * as an Enumeration of String objects, 
     * or an empty Enumeration if the filter has
     * no initialization parameters.
     */
    public Enumeration<String> getInitParameterNames();
}

public interface FilterChain {
    /**
    * Causes the next filter in the chain to be invoked, or if the calling filter is the last filter
    * in the chain, causes the resource at the end of the chain to be invoked.
    */
    public void doFilter ( ServletRequest request, ServletResponse response ) throws IOException, ServletException;
}
```

#### FilterChain

如果有下一个过滤器则则执行下一个过滤器，如果没有，则执行目标资源

### Filter配置

```xml
<filter>
    <filter-name>myFilter</filter-name>
    <filter-class>com.xpress.filter.MyFIlter</filter-class>
</filter>
<filter-mapping>
    <filter-name>myFilter</filter-name>
    <url-pattern>/*</url-pattern>
    <dispatcher>REQUEST</dispatcher>
    <dispatcher>FORWARD</dispatcher>
    <dispatcher>INCLUDE</dispatcher>
    <dispatcher>ERROR</dispatcher>
</filter-mapping>
```

#### 执行顺序

按照xml配置中的mapping顺序，依次次执行doFilter前内容，再倒序执行doFilter后内容

```
XML:
filterA
filterB

OUT:
filterAStart
filterBStart
doService
filterBEnd
FilterAEnd
```

#### 四种拦截方式

* 请求 REQUEST 默认
* 转发 FORWARD
* 包含 INCLUDE
* 错误 ERROR

### 过滤器的使用场景

* 执行目标资源的预处理操作，如设置编码
* 通过条件判断目标资源是否可达，如登陆判断
* 对目标输出资源进行数据处理

------

*以上概念总结于传智播客JavaWeb课程*