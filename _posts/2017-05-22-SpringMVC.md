---  
lajout: post  
title: SpringMVC  
tags: SpringMVC  
categories: JavaEE  
published: true  
---  

SpringMVC是Spring框架的一个模块，无需单独整合，是一个基于MVC的web框架

## 入门

web.xml

```xml
<servlet>
    <servlet-name>spring-webmvc</servlet-name>
    <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
    <init-param>
        <!--指定配置文件位置，如果不配置默认加载/WEB-INF/servlet名称-servlet.xml-->
        <param-name>contextConfigLocation</param-name>
        <param-value>classpath:spring-webmvc-servlet.xml</param-value>
    </init-param>
    <load-on-startup>1</load-on-startup>
</servlet>

<servlet-mapping>
    <servlet-name>spring-webmvc</servlet-name>
    <!--
    第一种：*.action，访问action由DispatcherServlet处理
    第二种：/，所有访问地址都由DispatcherServlet处理，
            对静态文件的解析需要配置不让DispatcherServlet进行解析
            此种方式可以实现RESTful风格的url
    第三种：/*，这种配置会将一个jsp页面的请求交给DispatcherServlet处理，最终找不到Handler报错
    -->
    <url-pattern>*.action</url-pattern>
</servlet-mapping>
```

spring-webmvc-servlet.xml

```xml
<!-- Handler -->
<bean name="myController.action" class="com.xpress.action.MyController"/>

<!--处理器适配器：实现接口自动当做HandlerAdapter-->
<bean class="org.springframework.web.servlet.mvc.SimpleControllerHandlerAdapter"/>
<!--处理器映射器：将bean的name作为url进行查找，需要在配置Handler时指定bean的name属性-->
<bean class="org.springframework.web.servlet.handler.BeanNameUrlHandlerMapping"/>
<!--视图解析器：解析jsp解析，默认使用jstl标签，classpath下要有jstl包-->
<bean class="org.springframework.web.servlet.view.InternalResourceViewResolver"/>
```

Controller

```java
public class MyController implements Controller {
    @Override
    public ModelAndView handleRequest(HttpServletRequest request, HttpServletResponse response) throws Exception {
        Users user = new Users();
        user.setUsername("admin");
        ModelAndView modelAndView = new ModelAndView();
        modelAndView.addObject("user", user);
        modelAndView.setViewName("myProfile.jsp");
        return modelAndView;
    }
}
```

## 注解开发

### 常用注解

### 参数绑定

#### 自定义参数绑定

## 框架原理

1. 发起请求到前端控制器（DispatcherServlet）
2. 前端控制器请求HandlerMapping查找Handler（根据xml或注解）
3. 处理映射器HandlerMapping向前端控制器返回Handler
4. 前端控制器调用处理器适配器执行Handler
5. 处理适配器HandlerAdapter去执行Handler
6. Handler执行完处理适配器向处理适配器返回ModelAndView
7. 处理适配器向前端控制器返回ModelAndView
8. 前端控制器请求视图解析器ViewResolver进行视图解析
9. 视图解析器向前端控制器返回View
9. 前端控制器进行视图渲染
10. 前端控制器向客户端响应

### DispatcherServlet前端控制器

接收请求，响应结果，相当于转发器，中央处理器，有了DispatcherServlet减少了其他组件之间的耦合性

### HandlerMapping处理器映射器

根据请求的url查找Handler

#### 注解

```xml
<!-- 注解映射器，实际开发中使用annotation-driven配置 -->
<!--before Spring 3.1-->
<bean class="org.springframework.web.servlet.mvc.annotation.DefaultAnnotationHandlerMapping"/>
<!--after Spring 3.1 需要指定-->
<bean class="org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping"/>
```

##### annotation-driven

```xml
<!-- 可省略注解映射器和注解适配器配置 -->
<!-- 默认加载很多的参数绑定方法，如json转换解析器，实际开发中使用这个配置 -->
<mvc:annotation-driven enable-matrix-variables="true"/>
```

#### 非注解

```xml
<bean id="myController" name="/myController.action" class="com.xpress.action.MyController"/>
<bean id="myHandler" class="com.xpress.action.MyHandler"/>

<!--多个映射器可以共存，能让那个映射器处理就会交个哪个映射器处理-->
<!--处理器映射器：将bean的name作为url进行查找，需要在配置Handler时指定bean的name属性-->
<bean class="org.springframework.web.servlet.handler.BeanNameUrlHandlerMapping"/>
<!--简单url映射器-->
<bean class="org.springframework.web.servlet.handler.SimpleUrlHandlerMapping">
    <property name="mappings">
        <props>
            <!--集中配置-->
            <prop key="/myController.action">myController</prop>
            <prop key="/myHandler.action">myHandler</prop>
        </props>
    </property>
</bean>
```

### HandlerAdapter处理器适配器

按照特定的规则（HandlerAdapter要求的规则）去执行Handler

#### 注解

```xml
<!-- 注解适配器，实际开发中使用annotation-driven配置，见映射器部分 -->
<!--before Spring 3.1-->
<bean class="org.springframework.web.servlet.mvc.annotation.AnnotationMethodHandlerAdapter"/>
<!--after Spring 3.1 需要指定-->
<bean class="org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter"/>
```

#### 非注解

```xml
<!--处理器适配器：实现接口自动当做HandlerAdapter-->
<!--SimpleControllerHandlerAdapter要求实现Controller接口-->
<bean class="org.springframework.web.servlet.mvc.SimpleControllerHandlerAdapter"/>
<!--HttpRequestHandlerAdapter要求实现HttpRequestHandler-->
<bean class="org.springframework.web.servlet.mvc.HttpRequestHandlerAdapter"/>
```

SimpleControllerHandlerAdapter

```java
@Override
public boolean supports(Object handler) {
    // 默认是否为Controller
    return (handler instanceof Controller);
}

@Override
public ModelAndView handle(HttpServletRequest request, HttpServletResponse response, Object handler)
        throws Exception {
    return ((Controller) handler).handleRequest(request, response);
}
```

### Handler处理器（Controller）

#### 注解

#### 非注解

Controller，对应SimpleControllerHandlerAdapter

```java
public class MyController implements Controller {
    @Override
    public ModelAndView handleRequest(HttpServletRequest request, HttpServletResponse response) throws Exception {
        Users user = new Users();
        user.setUsername("admin");
        ModelAndView modelAndView = new ModelAndView();
        modelAndView.addObject("user", user);
        modelAndView.setViewName("myProfile.jsp");
        return modelAndView;
    }
}
```

HttpRequestHandler，对应HttpRequestHandlerAdapter

```java
public class MyHandler implements HttpRequestHandler {
    @Override
    public void handleRequest(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        Users user = new Users();
        user.setUsername("admin");
        request.setAttribute("user", user);
        request.getRequestDispatcher("myProfile.jsp").forward(request, response);
        // 这种方式可以修改response返回json数据
    }
}
```

```java
public interface Controller {
    ModelAndView handleRequest(HttpServletRequest request, HttpServletResponse response) throws Exception;
}
```

### ViewResolver视图解析器

根据逻辑视图名解析真正的view

### View视图

是一个接口，实现支持不同的类型

### 默认配置

默认的HandlerMapping和HandlerAdatper配置：org/springframework/web/servlet/DispatcherServlet.properties

```properties
org.springframework.web.servlet.HandlerMapping=org.springframework.web.servlet.handler.BeanNameUrlHandlerMapping,\
    org.springframework.web.servlet.mvc.annotation.DefaultAnnotationHandlerMapping

org.springframework.web.servlet.HandlerAdapter=org.springframework.web.servlet.mvc.HttpRequestHandlerAdapter,\
    org.springframework.web.servlet.mvc.SimpleControllerHandlerAdapter,\
    org.springframework.web.servlet.mvc.annotation.AnnotationMethodHandlerAdapter
```

## SpringMVC和Struts2区别



------

*以上概念总结于传智播客SpringMVC课程*