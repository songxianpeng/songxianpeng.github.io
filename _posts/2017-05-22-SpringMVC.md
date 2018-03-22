---  
layout: post  
title: SpringMVC  
tags: SpringMVC  
categories: JavaEE  
published: true  
---  

SpringMVC是Spring框架的一个模块，无需单独整合，是一个基于MVC的web框架

## 启动

### JavaConfig

AbstractAnnotationConfigDispatcherServletInitializer剖析

> 在Servlet 3.0环境中，容器会在类路径中查找实现javax.servlet.ServletContainerInitializer接口的类，如果能发现的话，就会用它来配置Servlet容器。  
> Spring提供了这个接口的实现，名为SpringServletContainerInitializer，这个类反过来又会查找实现WebApplicationInitializer的类并将配置的任务交给它们来完成。
> Spring 3.2引入了一个便利的WebApplicationInitializer基础实现，也就是AbstractAnnotationConfigDispatcherServletInitializer。
> 因为我们的SpringMVCWebAppInitializer扩展了AbstractAnnotationConfig DispatcherServlet-Initializer（同时也就实现了WebApplicationInitializer），因此当部署到Servlet 3.0容器中的时候，容器会自动发现它，并用它来配置Servlet上下文。

```java
public class SpringMVCWebInitializer extends AbstractAnnotationConfigDispatcherServletInitializer {
    @Override
    protected Class<?>[] getRootConfigClasses() {
        return new Class<?>[]{RootConfig.class};
    }
    @Override
    protected Class<?>[] getServletConfigClasses() {
        return new Class<?>[]{WebConfig.class};
    }
    @Override
    protected String[] getServletMappings() {
        return new String[]{"/"};
    }
    // 自定义DispatcherServlet配置
    @Override
    protected void customizeRegistration(Dynamic registration) {
        registration.setMultipartConfig(// 指定上传文件目录及限制
                new MultipartConfigElement("/tmp/spittr/uploads", 2097152, 4194304, 0));
    }
    @Override
    protected Filter[] getServletFilters() {
        return new Filter[]{ new MyFilter() };
    }
}
```

**添加其他的Servlet和Filter**

基于Java的初始化器（initializer）的一个好处就在于我们可以定义任意数量的初始化器类。因此，如果我们想往Web容器中注册其他组件的话，只需创建一个新的初始化器就可以了。

```java
public class MyServletInitializer implements WebApplicationInitializer {
    @Override
    public void onStartup(ServletContext servletContext) {
        FilterRegistration.Dynamic myFilter = servletContext.addFilter("myFilter", new MyFilter());
        myFilter.addMappingForUrlPatterns(EnumSet.allOf(DispatcherType.class), false,"/**");

        ServletRegistration.Dynamic myServlet = servletContext.addServlet("myServlet", new MyServlet());
        myServlet.addMapping("/myServlet");
        
        servletContext.addListener(MyListener.class);
    }
}
```

如果你只是注册Filter，并且该Filter只会映射到DispatcherServlet上的话，那么在AbstractAnnotationConfigDispatcherServletInitializer中还有一种快捷方式，参看上面的getServletFilters方法。

**两个应用上下文**

当DispatcherServlet启动的时候，它会创建Spring应用上下文，并加载配置文件或配置类中所声明的bean。getServletConfigClasses()方法中，我们要求DispatcherServlet加载应用上下文时，使用定义在WebConfig配置类（使用Java配置）中的bean。

但是在Spring Web应用中，通常还会有另外一个应用上下文。另外的这个应用上下文是由ContextLoaderListener创建的。

我们希望DispatcherServlet加载包含Web组件的bean，如控制器、视图解析器以及处理器映射，而ContextLoaderListener要加载应用中的其他bean。这些bean通常是驱动应用后端的中间层和数据层组件。

实际上，AbstractAnnotationConfigDispatcherServletInitializer会同时创建DispatcherServlet和ContextLoaderListener。GetServlet-ConfigClasses()方法返回的带有@Configuration注解的类将会用来定义DispatcherServlet应用上下文中的bean。getRootConfigClasses()方法返回的带有@Configuration注解的类将会用来配置ContextLoaderListener创建的应用上下文中的bean。

它们俩是父子关系。parent context里的bean可以在child context里共享，但parent context中的bean取不到child context中的bean。

```java
@Configuration
@EnableWebMvc // 启用注解驱动的Spring MVC。
@ComponentScan("com.xpress.web") // 启动组件扫描
public class WebConfig extends WebMvcConfigurerAdapter {
    @Bean
    public ViewResolver viewResolver() {
        // 配置视图解析器，默认默认会使用BeanNameView-Resolver，这个视图解析器会查找ID与视图名称匹配的bean，并且查找的bean要实现View接口，它以这样的方式来解析视图。
        InternalResourceViewResolver resolver = new InternalResourceViewResolver();
        resolver.setPrefix("/WEB-INF/views/");
        resolver.setSuffix(".jsp");
        // for jstl
        // resolver.setViewClass(JstlView.class);
        return resolver;
    }
    @Override
    public void configureDefaultServletHandling(DefaultServletHandlerConfigurer configurer) {
        // 排除静态资源映射
        configurer.enable();
    }
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        super.addResourceHandlers(registry);
    }
}
```

```java
@Configuration
@Import(DataConfig.class)
@ComponentScan(basePackages = {"com.xpress"},
        excludeFilters = {
                @Filter(type = FilterType.CUSTOM, value = WebPackage.class)
        })
public class RootConfig {
    public static class WebPackage extends RegexPatternTypeFilter {
        public WebPackage() {
            // 排除DispatcherServlet上下文下的bean
            super(Pattern.compile("com\\.xpress\\.web.*|com\.xpress\.config.*"));
        }
    }
}
```

### XML

web.xml

```xml
<listener>
    <listener-class>org.springframework.web.context.ContextLoaderListener</listener-class>
</listener>
<context-param>
    <param-name>contextConfigLocation</param-name>
    <param-value>classpath:applicationContext.xml</param-value>
</context-param>
<servlet>
    <servlet-name>spring-webmvc</servlet-name>
    <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
    <init-param>
        <!--指定配置文件位置，如果不配置默认加载/WEB-INF/servlet名称-servlet.xml-->
        <param-name>contextConfigLocation</param-name>
        <param-value>classpath:spring-webmvc-servlet.xml</param-value>
    </init-param>
    <init-param>
        <param-name>spring.profiles.default</param-name>
        <param-value>dev</param-value>
    </init-param>
    <load-on-startup>1</load-on-startup>
</servlet>

<!-- 使用JavaConfig -->
<listener>
    <listener-class>org.springframework.web.context.support.AnnotationConfigWebApplicationContext</listener-class>
</listener>
<context-param>
    <param-name>contextConfigLocationon</param-name>
    <param-value>com.xpress.config.RootConfig</param-value>
</context-param>
<servlet>
    <servlet-name>spring-webmvc</servlet-name>
    <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
    <init-param>
        <param-name>contextConfigLocation</param-name>
        <param-value>com.xpress.web.config.WebConfig</param-value>
    </init-param>
    <init-param>
        <param-name>contextClass</param-name>
        <param-value>org.springframework.web.context.support.AnnotationConfigWebApplicationContext</param-value>
    </init-param>
    <init-param>
        <param-name>spring.profiles.default</param-name>
        <param-value>dev</param-value>
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

### Controller

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

测试

```java
@Controller
@RequestMapping("/spittles")
public class HomeController {
    @RequestMapping(value = "/{spittleId}", method = RequestMethod.GET)
    public String spittle(@PathVariable("spittleId") long spittleId, Model model) {
        model.addAttribute(spittleRepository.findOne(spittleId));
        return "spittle";
    }
}
```

```java
import static org.hamcrest.Matchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.*;

@Test
public void testSpittle() throws Exception {
    Spittle expectedSpittle = new Spittle("Hello", new Date());
    SpittleRepository mockRepository = mock(SpittleRepository.class);
    when(mockRepository.findOne(12345)).thenReturn(expectedSpittle);

    SpittleController controller = new SpittleController(mockRepository);
    MockMvc mockMvc = standaloneSetup(controller).build();

    mockMvc.perform(get("/spittles/12345"))
            .andExpect(view().name("spittle"))
            .andExpect(model().attributeExists("spittle"))
            .andExpect(model().attribute("spittle", expectedSpittle));
}
```

## 框架原理

Spring MVC的实现大致由以下几个步骤完成：

* 需要建立Controller控制器和HTTP请求之间的映射关系
    - 这个工作是由在handlerMapping中封装的HandlerExecutionChain对象来完成的，而对Controller控制器和HTTP请求的映射关系的配置是在Bean定义中描述，并在IoC容器初始化时，通过初始化HandlerMapping来完成的，这些定义的映射关系会被载入到一个handlerMap中使用。
* 在初始化过程中，Controller对象和HTTP请求之间的映射关系建立好以后，为Spring MVC接收HTTP请求并完成响应处理做好了准备。
    - DispatcherServlet会根据具体的URL请求信息，在HandlerMapping中进行查询，从而得到对应的HandlerExecutionChain。在这个HandlerExecutionChain中封装了配置的Controller，这个请求对应的Controller会完成请求的响应动作，生成需要的ModelAndView对象，这个对象就像它的名字所表示的一样，可以从该对象中获得Model模型数据和视图对象。
* 得到ModelAndView以后，DispatcherServlet把获得的模型数据交给特定的视图对象，从而完成这些数据的视图呈现工作。
    - 这个视图呈现由视图对象的render方法来完成。

### 上下文在Web容器中的启动

在Web容器中启动Spring应用程序的过程：

![ContextLoaderListener](/static/img/spring-mvc/ContextLoaderListener.png "ContextLoaderListener")

载入IoC容器过程中的3个类之间的关系：

![ContextLoaderListenerHierarchy](/static/img/spring-mvc/ContextLoaderListenerHierarchy.png "ContextLoaderListenerHierarchy")

在ContextLoader中，完成了两个IoC容器建立的基本过程，一个是在Web容器中建立起双亲IoC容器，另一个是生成相应的WebApplicationContext并将其初始化。

WebApplicationContext接口的类继承关系：

![WebApplicationContextHierarchy](/static/img/spring-mvc/WebApplicationContextHierarchy.png "WebApplicationContextHierarchy")

* ContextLoaderListener
    - contextInitialized()
        + ContextLoader
            * initWebApplicationContext()
                - createWebApplicationContext()
                    + determineContextClass()
                - configureAndRefreshWebApplicationContext()
                    + AbstractApplicationContext
                        * refresh()

### DispatcherServlet的启动和初始化

作为一个Servlet，DispatcherServlet实现的是Sun的J2EE核心模式中的前端控制器模式（Front Controller），作为一个前端控制器，所有的Web请求都需要通过它来处理，进行转发、匹配、数据处理后，并转由页面进行展现，因此这个DispatcerServlet可以看成是Spring MVC实现中最为核心的部分，它的设计与分析也是下面分析Spring MVC的一条主线。

DispatcherServlet会建立自己的上下文来持有Spring MVC的Bean对象，在建立这个自己持有的IoC容器时，会从ServletContext中得到根上下文作为DispatcherServlet持有上下文的双亲上下文。有了这个根上下文，再对自己持有的上下文进行初始化，最后把自己持有的这个上下文保存到ServletContext中，供以后检索和使用。

对具体的一个Bean定义查找过程来说，如果要查找一个由DispatcherServlet所在的IoC容器来管理的Bean，系统会首先到根上下文中去查找。如果查找不到，才会到DispatcherServlet所管理的IoC容器去进行查找，这是由IoC容器getBean的实现来决定的。

DispacherServlet类的继承关系：

![DispatcherServlet](/static/img/spring-mvc/DispatcherServlet.png "DispatcherServlet")

DispatcherServlet的工作大致可以分为两个部分：

* 一个是初始化部分，由initServletBean()启动，通过initWebApplicationContext()方法最终调用DispatcherServlet的initStrategies方法，在这个方法里，DispatcherServlet对MVC模块的其他部分进行了初始化，比如handlerMapping、ViewResolver等
* 另一个是对HTTP请求进行响应，作为一个Servlet, Web容器会调用Servlet的doGet()和doPost()方法，在经过FrameworkServlet的processRequest()简单处理后，会调用DispatcherServlet的doService()方法，在这个方法调用中封装了doDispatch()，这个doDispatch()是Dispatcher实现MVC模式的主要部分

DispatcherServlet的处理过程：

![DispatcherServlet-process](/static/img/spring-mvc/DispatcherServlet-process.png "DispatcherServlet-process")

### MVC处理HTTP分发请求

![flow](/static/img/spring-mvc/flow.png "flow")

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

* DispatcherServlet#doService#doDispatch FrameworkServlet的service方法调用
    - mappedHandler = getHandler(processedRequest);
        + HandlerExecutionChain handler = hm.getHandler(request);
    - HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());
    - mv = ha.handle(processedRequest, response, mappedHandler.getHandler());
    - processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);
        + render(mv, request, response);
            * view = mv.getView();
            * view.render(mv.getModelInternal(), request, response);

doDispatch协同模型和控制器的过程：

![doDispath](/static/img/spring-mvc/doDispath.png "doDispath")

HandlerMapping的设计原理：

![HandlerMappingHierarchy](/static/img/spring-mvc/HandlerMappingHierarchy.png "HandlerMappingHierarchy")

在HandlerMapping接口中定义了一个getHandler方法，通过这个方法，可以获得与HTTP请求对应的HandlerExecutionChain，HandlerExecutionChain持有一个Interceptor链和一个handler对象，这个handler对象实际上就是HTTP请求对应的Controller，在持有这个handler对象的同时，还在HandlerExecutionChain中设置了一个拦截器链，通过这个拦截器链中的拦截器，可以为handler对象提供功能的增强。

* AbstractHandlerMapping
    - getHandler()
        + AbstractUrlHandlerMapping
            * getHandlerInternal()
                - lookupHandler()
        + getHandlerExecutionChain()

注册过程在容器对Bean进行依赖注入时发生，它实际上是通过一个Bean的postProcessor来完成的。SimpleHandlerMapping是ApplicationContextAware的子类才能启动这个注册过程。

* ApplicationObjectSupport
    - setApplicationContext()
        + SimpleUrlHandlerMapping
            * initApplicationContext()
                - registerHandlers()

Spring MVC的继承关系：

![ViewHierarchy](/static/img/spring-mvc/ViewHierarchy.png "ViewHierarchy")



## 应用

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
<!-- 项目里有两个Spring容器，一个是Spring的容器，一个是Spring的WEB容器，他们互为父子（Spring容器为父，WEB容器为儿），@Controller的扫描应该放在WEB容器的配置文件里 -->
<context:component-scan base-package="com.xpress.controller"/>
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

```java
@Controller
public class AnnotationController {
    @RequestMapping("userProfile")
    public ModelAndView userProfile(HttpServletRequest request, HttpServletResponse response) throws Exception {
        Users user = new Users();
        user.setUsername("admin");
        ModelAndView modelAndView = new ModelAndView();
        modelAndView.addObject("user", user);
        modelAndView.setViewName("myProfile.jsp");
        return modelAndView;
    }
}
```

##### @RequestMapping

```java
@Controller
@RequestMapping("user")// 配置请求根路径，窄化请求路径
public class AnnotationController {
    @RequestMapping(value = "userProfile", method = {RequestMethod.GET})// 请求方法限定
    public ModelAndView userProfile() throws Exception {
        Users user = new Users();
        user.setUsername("admin");
        ModelAndView modelAndView = new ModelAndView();
        modelAndView.addObject("user", user);
        modelAndView.setViewName("myProfile");
        return modelAndView;
    }
}

@RequestMapping(value = "/spittle", method = RequestMethod.GET)
public String spittle(Model model) {// Model类型可换为Map
    // 省略key，默认根据类型推断为spittleList
    model.addAttribute(spittleRepository.findOne(spittleId));
    return "spittle";
}
@RequestMapping(value = "/spittle", method = RequestMethod.GET)
public List<Spittle> spittle() {
    // 省略key，默认根据类型推断为spittleList，省略view名字，自动推断为map名spittle
    return spittleRepository.findOne(spittleId);
}
```

##### Controller返回值

* ModelAndView
* String
* Redirect
* Forward request复用
* void

**ModelAndView**

见RequestMapping

**String**

```java
@RequestMapping(value = "userProfile", method = {RequestMethod.GET})
public String userProfile(Model model) throws Exception {
    Users user = new Users();
    user.setUsername("admin");
    model.addAttribute("user", user);
    return "myProfile";// 直接返回逻辑页面名称（最终加上前缀、后缀、Controller根）
}
```

**Redirect**

```java
return "redirect:/index.jsp";
```

**Forward**

```java
return "forwar:/index.jsp";
```

**void**

参数上可以定义request和response对象进行操作

###### 跨重定向请求传递数据

![redirect](/static/img/spring-mvc/redirect.png "redirect")

有一些其他方案，能够从发起重定向的方法传递数据给处理重定向方法中：

* 使用URL模板以路径变量和/或查询参数的形式传递数据；
* 通过flash属性发送数据。

URL模板：

```java
return "redirect:/user/" + user.getUsername();
```

```java
modelAndView.addObject("username",user.getUsername());
modelAndView.addObject("userId",user.getId());
return "redirect:/user/{username}";// user/xpress?userId=1
```

username作为占位符填充到了URL模板中，而不是直接连接到重定向String中，所以username中所有的不安全字符都会进行转义。这样会更加安全，这里允许用户输入任何想要的内容作为username，并会将其附加到路径上。

除此之外，模型中所有其他的原始类型值都可以添加到URL中作为查询参数。

URL模板只能用来发送简单的值，如String和数字的值。在URL中，并没有办法发送更为复杂的值，但这正是flash属性能够提供帮助的领域。

flash属性：

* 在重定向执行之前，所有的flash属性都会复制到会话中。
* 在重定向后，存在会话中的flash属性会被取出，并从会话转移到模型之中。处理重定向的方法就能从模型中访问Spitter对象了，就像获取其他的模型对象一样。

![flash](/static/img/spring-mvc/flash.png "flash")

```java
@RequestMapping(value = "/register", method = POST)
public String processRegistration(@Validated User user,RedirectAttributes redirectAttributes) throws IOException {
    // ...
    redirectAttributes.addFlashAttribute("user",user);
    return "redirect:/user/{username}";
}
```


##### 参数绑定

Spring MVC允许以多种方式将客户端中的数据传送到控制器的处理器方法中：

* 查询参数（Query Parameter）
* 表单参数（Form Parameter）
* 路径变量（Path Variable）

适配器通过不同的convertor对参数进行绑定

###### 默认支持的参数绑定类型

* HttpServletRequest
* HttpServletResponse
* HttpSession
* Model/ModelMap
* 简单数据类型
    - 不使用注解，参数名和变量名称一致
    - 使用@RequestParam注解映射参数名变量名可以不一致

**@RequestParam**

```java
// 不同名参数绑定，并要求非必输，默认值为0
@RequestMapping(value = "userProfile", method = {RequestMethod.GET})
public String param(@RequestParam(value = "id", required = false, defaultValue = "0") Integer count) throws Exception {
    System.out.println(count);
    return "myProfile";
}
```

###### 绑定POJO

参数名称和POJO中的成员变量名称一致即可完成绑定

```html
<form action="${pageContext.request.contextPath}/user/userProfile.action">
    <input type="text" name="username"/>
    <input type="text" name="item.name"/>
    <input type="submit"/>
</form>
```

```java
public class UserCustom extends User {
    Item item;
    //get set ...
}

@RequestMapping(value = "userProfile", method = { RequestMethod.POST})
public String userProfile(Model model, UserCustom userCustom) throws Exception {
    model.addAttribute("userCustom", userCustom);
    return "myProfile";
}
```

*Tips：在绑定时表单不写action，提交地址与url地址相同，这样分别写两个map相同的method分别处理Get和Post请求*

###### 绑定集合

* array 名称相同直接绑定
* list POJO中添加list和页面下标
* map POJO中添加map和页面下标

```html
<input type="text" name="itemList[0].name"/>
<input type="text" name="itemMap['name']"/>
```

```java
public class UserCustom extends User {
    List<Item> itemList;
    Map itemMap;
    //get set...
}
```

###### 数据类型转换

```xml
<mvc:annotation-driven conversion-service="customConversionService"/>

<bean id="customConversionService"
      class="org.springframework.format.support.FormattingConversionServiceFactoryBean">
    <property name="converters">
        <set>
            <bean class="com.xpress.converter.MyDateConverter"/>
        </set>
    </property>
</bean>
```

```java
public class MyDateConverter implements Converter<String, Date> {
    @Override
    public Date convert(String source) {
        SimpleDateFormat simpleDateFormat = new SimpleDateFormat("yyyy--MM-dd");
        Date date = null;
        try {
            date = simpleDateFormat.parse(source);
        } catch (ParseException e) {
            e.printStackTrace();
        }
        return date;
     }
}
```

##### 数据校验

在Spring MVC中要使用Java校验API的话，并不需要什么额外的配置。只要保证在类路径下包含这个Java API的实现即可，比如Hibernate Validator。

使用hibernate校验器

```xml
<dependency>
    <groupId>org.hibernate</groupId>
    <artifactId>hibernate-validator</artifactId>
    <version>5.2.4.Final</version>
</dependency>
```

```xml
<mvc:annotation-driven conversion-service="customConversionService" validator="customerValidator"/>

 <!--校验器-->
<bean id="customerValidator" class="org.springframework.validation.beanvalidation.LocalValidatorFactoryBean">
    <!--使用hibernate校验器-->
    <property name="providerClass" value="org.hibernate.validator.HibernateValidator"/>
    <!--配置错误信息-->
    <property name="validationMessageSource" ref="messageSource"/>
</bean>

<bean id="messageSource"
          class="org.springframework.context.support.ResourceBundleMessageSource">
    <property name="basenames">
        <list>
            <value>xpress</value>
        </list>
    </property>
    <property name="defaultEncoding" value="UTF-8"/>
    <property name="useCodeAsDefaultMessage" value="true"/>
    <property name="cacheSeconds" value="120"/>
</bean>
```

Java校验API定义了多个注解，这些注解可以放到属性上，从而限制这些属性的值。所有的注解都位于javax.validation.constraints包中。

Java校验API所提供的校验注解：

|   注解   |                                描述                                |
|--------------|------------------------------------------------------------------------|
| @AssertFalse | 所注解的元素必须是Boolean类型，并且值为false                           |
| @AssertTrue  | 所注解的元素必须是Boolean类型，并且值为true                            |
| @DecimalMax  | 所注解的元素必须是数字，并且它的值要小于或等于给定的BigDecimalString值 |
| @DecimalMin  | 所注解的元素必须是数字，并且它的值要大于或等于给定的BigDecimalString值 |
| @Digits      | 所注解的元素必须是数字，并且它的值必须有指定的位数                     |
| @Future      | 所注解的元素的值必须是一个将来的日期                                   |
| @Max         | 所注解的元素必须是数字，并且它的值要小于或等于给定的值                 |
| @Min         | 所注解的元素必须是数字，并且它的值要大于或等于给定的值                 |
| @NotNull     | 所注解元素的值必须不能为null                                           |
| @Null        | 所注解元素的值必须为null                                               |
| @Past        | 所注解的元素的值必须是一个已过去的日期                                 |
| @Pattern     | 所注解的元素的值必须匹配给定的正则表达式                               |
| @Size        | 所注解的元素的值必须是String、集合或数组，并且它的长度要符合给定的范围 |


```java
// UserCustom类，继承自Users
// UserCustom成员
public class UsersCustom extends Users {
    @Valid //成员变量需要校验注解，继而校验该类成员
    Item item;
    // get set...   
}
// Users成员
// 指定一个分组，这样同一filed可以根据分组不同判断是否校验
@Size(min = 1, max = 20, message = "{user.username.error}", groups = OrderGroup.class)
private String username;
// Item类 
// message用于回线错误信息，可以采用类跟路径下的ValidationMessage.properties或者指定关联Spring i8n配置
// message内容可以采用占位符，如{min}或者{max}
@NotEmpty(message = "{item.name.notNull}", groups = OrderGroup.class)
private String name;
```

```java
// 分组接口
public interface OrderGroup {
}
```

```java
// @Validated和BindingResult配对使用，顺序一前一后
@RequestMapping("initUserOrder")
public String initUserOrder(Model model, @Validated(OrderGroup.class) UsersCustom usersCustom, BindingResult bindingResult) {
    if (bindingResult.hasErrors()) {
        model.addAttribute("errors", bindingResult.getAllErrors());
        return "userOrder";
    }
    return "order";
}
```

```xml
<c:if test="${errors!=null}">
    <c:forEach items="${errors}" var="error">
        ${error.defaultMessage}
    </c:forEach>
</c:if>
```

##### 文件上传和自定义验证器

**Resolver**

从Spring 3.1开始，Spring内置了两个MultipartResolver的实现供我们选择：

* CommonsMultipartResolver：使用Jakarta Commons FileUpload解析multipart请求
* StandardServletMultipartResolver：依赖于Servlet 3.0对multipart请求的支持（始于Spring 3.1）

*Tips：一般来讲，在这两者之间，StandardServletMultipartResolver可能会是优选的方案。它使用Servlet所提供的功能支持，并不需要依赖任何其他的项目*



CommonsMultipartResolver：

```xml
<!--文件上传解析器-->
<bean id="multipartResolver" class="org.springframework.web.multipart.commons.CommonsMultipartResolver">
    <!--上传大小5mb-->
    <property name="maxUploadSize" value="5242880"/>
    <!--每个文件最大容量过-->
    <property name="maxUploadSizePerFile" value="2097152"/>
    <!-- 文件上传路径 -->
    <property name="uploadTempDir" value="/temp/file/uploads"/>
    <!--直接写入硬盘-->
    <property name="maxInMemorySize" value="0"/>
</bean>
```

```java
@Bean
public MultipartResolver multipartResolver() throws IOException {
    CommonsMultipartResolver multipartResolver = new CommonsMultipartResolver();
    multipartResolver.setUploadTempDir(new FileSystemResource("/temp/file/uploads"));
    multipartResolver.setMaxUploadSize(5242880);
    multipartResolver.setMaxUploadSizePerFile(2097152);
    multipartResolver.setMaxInMemorySize(0);
    return multipartResolver;
}
```

StandardServletMultipartResolver：

构造器所能接受的参数如下：

* 临时路径的位置
* 上传文件的最大容量（以字节为单位）。默认是没有限制的
* 整个multipart请求的最大容量（以字节为单位），不会关心有多少个part以及每个part的大小。默认是没有限制的
* 在上传的过程中，如果文件大小达到了一个指定最大容量（以字节为单位），将会写入到临时文件路径中。默认值为0，也就是所有上传的文件都会写入到磁盘上

```java
@Bean
public MultipartResolver multipartResolver() throws IOException {
    return new StandardServletMultipartResolver();
}
```

*Java配置另参考上文《Java配置》中custom方法对multipart参数配置*

```xml
<servlet>
    <servlet-name>spring-webmvc</servlet-name>
    <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
    <init-param>
        <!--指定配置文件位置，如果不配置默认加载/WEB-INF/servlet名称-servlet.xml-->
        <param-name>contextConfigLocation</param-name>
        <param-value>classpath:spring-webmvc-servlet.xml</param-value>
    </init-param>
    <init-param>
        <!--指定配置文件位置，如果不配置默认加载/WEB-INF/servlet名称-servlet.xml-->
        <param-name>spring.profiles.default</param-name>
        <param-value>dev</param-value>
    </init-param>
    <load-on-startup>1</load-on-startup>
    <multipart-config>
        <!--位置-->
        <location>/temp/file/uploads</location>
        <!--最大文件大小-->
        <max-file-size>2097152</max-file-size>
        <!--最大请求大小-->
        <max-request-size>4194304</max-request-size>
        <!--直接写入硬盘-->
        <file-size-threshold>1</file-size-threshold>
    </multipart-config>
</servlet>
```


**接收**

@RequestPart形式接收：

```java
@RequestMapping(method = RequestMethod.POST)
    public String processUpload(@RequestPart("file") byte[] file) {
        return "redirect:/";
    }
```

MultipartFile形式接收及自定义校验：

```java
public interface MultipartFile {
    String getName();
    String getOriginalFilename();
    String getContentType();
    boolean isEmpty();
    long getSize();
    byte[] getBytes() throws IOException;
    InputStream getInputStream() throws IOException;
    void transferTo(File dest) throws IOException, IllegalStateException;
}
```

```java
// 自定义校验器
public class ContentTypeMultipartFileValidator implements ConstraintValidator<ContentType, MultipartFile> {
    private String[] acceptedContentTypes;
    @Override
    public void initialize(ContentType constraintAnnotation) {
        this.acceptedContentTypes = constraintAnnotation.value();
    }
    @Override
    public boolean isValid(MultipartFile value, ConstraintValidatorContext context) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        return ContentTypeMultipartFileValidator.acceptContentType(value.getContentType(), acceptedContentTypes);
    }
    private static boolean acceptContentType(String contentType, String[] acceptedContentTypes) {
        for (String accept : acceptedContentTypes) {
            if (contentType.equalsIgnoreCase(accept)) {
                return true;
            }
        }
        return false;
    }
}
```

```java
// 自定义校验注解
@Documented
@Retention(RUNTIME)
// 校验类
@Constraint(validatedBy = {ContentTypeMultipartFileValidator.class})
@Target({METHOD, FIELD, ANNOTATION_TYPE, CONSTRUCTOR, PARAMETER})
public @interface ContentType {
    String message() default "{fileUpload.error.type}";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
    String[] value();
}
```

```java
public class UploadVO {
    // 自定义校验注解
    @ContentType({"image/jpeg","image/png","image/jpg","image/gif"})
    private MultipartFile multipartFile;
    public MultipartFile getMultipartFile() {
        return multipartFile;
    }
    public void setMultipartFile(MultipartFile multipartFile) {
        this.multipartFile = multipartFile;
    }
}
```

```java
// 在springmvc加载的properties中注入属性
@Value("${fileUpload.image.dir}")
private String imageSaveDir;

@RequestMapping("uploadLogo")
public String uploadLogo(Model model, @Validated UploadVo vo, BindingResult bindingResult) throws ServiceException, IOException {
    if (bindingResult.hasErrors()) {
        model.addAttribute("errors", bindingResult.getAllErrors());
        return "upload";
    }
    String originalFilename = vo.getMultipartFile().getOriginalFilename();
    String suffix = originalFilename.substring(originalFilename.lastIndexOf("."));
    File file = new File(imageSaveDir + UUID.randomUUID().toString() + suffix);
    vo.getMultipartFile().transferTo(file);
    return "success";
}
```

以Part的形式接收上传文件（Servlet3.0版本中MultipartFile的替代）：

通过Part参数的形式接受文件上传，那么就没有必要配置MultipartResolver了。

```java
@RequestMapping(value = "/register", method = POST)
public String processRegistration(
        @RequestPart(value = "profilePictures", required = false) Part fileBytes,
        Errors errors) throws IOException {
    fileBytes.write("path/filename.suffix");
    return "redirect:/xpress/";
}
```

##### 数据回显

* SpringMVC默认支持POJO同命成员数据回显，不同名数据使用注解指定回显变量名
* 简单数据类型可以使用Model放置到request中
* Controller中使用@ModelAttribute注解直接将方法返回结果放置到request中

```java
// POJO直接映射，可以使用注解改变key
public String userProfile(Model model, @ModelAttribute("user") @Validated(UserGroup.class) UserCustom userCustom, BindingResult bindingResult) throws Exception
```

```java
// 直接放置方法返回值至request,key为userInfo
@ModelAttribute("userInfo")
public UsersCustom userInfo() {
    UsersCustom usersCustom = new UsersCustom();
    usersCustom.setId(110);
    return usersCustom;
}
```

##### JSON返回

使用annotation-driven默认支持jackson转换json，使用注解@ResponseBody和@RequestBody

```xml
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
    <version>2.7.9.1</version>
</dependency>
```

```java
@Controller
@RequestMapping("/json")
public class JsonController {
    // 上送json返回json
    @RequestMapping("requestJson")
    @ResponseBody
    public Item requestJson(@RequestBody Item item) {
        item.setOrderDetailId(item.getId() + 1);
        return item;
    }
    // 上送普通表单数据返回json
    @RequestMapping("responseJson")
    @ResponseBody
    public Item responseJson(Item item) {
        item.setOrderDetailId(item.getId() + 1);
        return item;
    }
}
// 空值转化
@JsonSerialize(include=JsonSerialize.Inclusion.NON_NULL)
class Item{
    String id;
    String orderDetailId;
    //...
}
```

```js
function req() {
    var data = {"name":"item","id":1};
    $.ajax({
        type: 'POST',
        url: "${pageContext.request.contextPath}/json/requestJson.action",
        contentType: "application/json;charset=UTF-8",
        data: JSON.stringify(data),
        dataType:"json",
        success: function (data) {
            alert(data.orderDetailId);
        }
    });
}
function res() {
    $.ajax({
        url: "${pageContext.request.contextPath}/json/responseJson.action",
        data: "name=item&id=2",
        success: function (data) {
            alert(data.orderDetailId);
        }
    });
}
```

##### RESTful支持

###### REST的基础知识

REST与RPC几乎没有任何关系。RPC是面向服务的，并关注于行为和动作；而REST是面向资源的，强调描述应用程序的事物和名词。

* 表述性（Representational）：REST资源实际上可以用各种形式来进行表述，包括XML、JSON（JavaScript Object Notation）甚至HTML——最适合资源使用者的任意形式
* 状态（State）：当使用REST的时候，我们更关注资源的状态而不是对资源采取的行为
* 转移（Transfer）：REST涉及到转移资源数据，它以某种表述性形式从一个应用转移到另一个应用

RESTful（Representational State Transfer表现层状态转化）是一种对URL和http请求的规范，我们用的较多的时对url的规范

* 每一个URI代表一种资源
* 客户端和服务器之间，传递这种资源的某种表现层
* 客户端通过四个HTTP动词，对服务器端资源进行操作，实现"表现层状态转化"

REST就是将资源的状态以最适合客户端或服务端的形式从服务器端转移到客户端（或者反过来）。

REST中会有行为，它们是通过HTTP方法来定义的。具体来讲，也就是GET、POST、PUT、DELETE、PATCH以及其他的HTTP方法构成了REST中的动作。这些HTTP方法通常会匹配为如下的CRUD动作：

* Create：POST
* Read：GET
* Update：PUT或PATCH
* Delete：DELETE

尽管通常来讲，HTTP方法会映射为CRUD动作，但这并不是严格的限制。有时候，PUT可以用来创建新资源，POST可以用来更新资源。实际上，POST请求非幂等性（non-idempotent）的特点使其成为一个非常灵活的方法，对于无法适应其他HTTP方法语义的操作，它都能够胜任。

###### Spring支持的REST

4.0版本中，Spring支持以下方式来创建REST资源：

* 控制器可以处理所有的HTTP方法，包含四个主要的REST方法：GET、PUT、DELETE以及POST。Spring 3.2及以上版本还支持PATCH方法；
* 借助@PathVariable注解，控制器能够处理参数化的URL（将变量输入作为URL的一部分）；
* 借助Spring的视图和视图解析器，资源能够以多种方式进行表述，包括将模型数据渲染为XML、JSON、Atom以及RSS的View实现；
* 可以使用ContentNegotiatingViewResolver来选择最适合客户端的表述；
* 借助@ResponseBody注解和各种HttpMethodConverter实现，能够替换基于视图的渲染方式；
* 类似地，@RequestBody注解以及HttpMethodConverter实现可以将传入的HTTP数据转化为传入控制器处理方法的Java对象；
* 借助RestTemplate，Spring应用能够方便地使用REST资源。

```xml
<!-- web.xml中增加对RESTful支持的拦截 -->
<servlet-mapping>
    <servlet-name>spring-webmvc</servlet-name>
    <url-pattern>/</url-pattern>
</servlet-mapping>
```

```xml
<!-- 配置静态资源和欢迎文件访问 -->
<mvc:resources mapping="/js/**" location="/js/"/>
<mvc:default-servlet-handler/>
```

```java
// http://localhost:8080/json/item/1/1
// 可以使用POJO接收或者使用基础数据类型和注解@PathVariable接收
@RequestMapping("item/{id}/{orderDetailId}")
@ResponseBody
public List<Items> item(@Validated ItemVO itemVO, @PathVariable Integer orderDetailId) throws Exception {
    ItemsExample itemsExample = new ItemsExample();
    itemsExample.createCriteria().andIdEqualTo(itemVO.getId()).andOrderDetailIdEqualTo(orderDetailId);
    List<Items> itemsList = itemsMapper.selectByExample(itemsExample);
    return itemsList;
}
```

```java
public class ItemVO {
    Items items;
    Integer id;
    // get set...
}
```

Spring提供了两种方法将资源的Java表述形式转换为发送给客户端的表述形式：

* 内容协商（Content negotiation）：选择一个视图，它能够将模型渲染为呈现给客户端的表述形式；
* 消息转换器（Message conversion）：通过一个消息转换器将控制器所返回的对象转换为呈现给客户端的表述形式。

**协商资源表述**

Spring的ContentNegotiatingViewResolver是一个特殊的视图解析器，它考虑到了客户端所需要的内容类型。按照其最简单的形式，ContentNegotiatingViewResolver可以按照下述形式进行配置：

```java
@Bean
public ViewResolver viewResolver() {
    return new ContentNegotiatingViewResolver();
}
```

要理解ContentNegotiating-ViewResolver是如何工作的，这涉及内容协商的两个步骤：

1. 确定请求的媒体类型
2. 找到适合请求媒体类型的最佳视图

**确定请求的媒体类型**

ContentNegotiatingViewResolver将会考虑到Accept头部信息并使用它所请求的媒体类型，但是它会首先查看URL的文件扩展名。如果URL在结尾处有文件扩展名的话，ContentNegotiatingViewResolver将会基于该扩展名确定所需的类型。如果扩展名是“.json”的话，那么所需的内容类型必须是“application/json”。如果扩展名是“.xml”，那么客户端请求的就是“application/xml”。当然，“.html”扩展名表明客户端所需的资源表述为HTML（text/html）。

如果根据文件扩展名不能得到任何媒体类型的话，那就会考虑请求中的Accept头部信息。在这种情况下，Accept头部信息中的值就表明了客户端想要的MIME类型，没有必要再去查找了。

最后，如果没有Accept头部信息，并且扩展名也无法提供帮助的话，ContentNegotiatingViewResolver将会使用“/”作为默认的内容类型，这就意味着客户端必须要接收服务器发送的任何形式的表述。

一旦内容类型确定之后，ContentNegotiatingViewResolver就该将逻辑视图名解析为渲染模型的View。与Spring的其他视图解析器不同，ContentNegotiatingViewResolver本身不会解析视图。而是委托给其他的视图解析器，让它们来解析视图。

ContentNegotiatingViewResolver要求其他的视图解析器将逻辑视图名解析为视图。解析得到的每个视图都会放到一个列表中。这个列表装配完成后，ContentNegotiatingViewResolver会循环客户端请求的所有媒体类型，在候选的视图中查找能够产生对应内容类型的视图。第一个匹配的视图会用来渲染模型。

**影响媒体类型的选择**

在上述的选择过程中，我们阐述了确定所请求媒体类型的默认策略。但是通过为其设置一个ContentNegotiationManager，我们能够改变它的行为。借助Content-NegotiationManager我们所能做到的事情如下所示：

* 指定默认的内容类型，如果根据请求无法得到内容类型的话，将会使用默认值
* 通过请求参数指定内容类型
* 忽视请求的Accept头部信息
* 将请求的扩展名映射为特定的媒体类型
* 将JAF（Java Activation Framework）作为根据扩展名查找媒体类型的备用方案

有三种配置ContentNegotiationManager的方法：

* 直接声明一个ContentNegotiationManager类型的bean
* 通过ContentNegotiationManagerFactoryBean间接创建bean
* 重载WebMvcConfigurerAdapter的configureContentNegotiation()方法

直接创建ContentNegotiationManager有一些复杂，除非有充分的原因，否则我们不会愿意这样做。后两种方案能够让创建ContentNegotiationManager更加简单。

```xml
<bean id="contentNegotiationManager" class="org.springframework.web.accept.ContentNegotiationManagerFactoryBean" p:defaultContentType="application/json"/>
```

```java

@Configuration
@EnableWebMvc
@ComponentScan("spittr.web")
public class WebConfig extends WebMvcConfigurerAdapter {
    @Bean
    public ViewResolver viewResolver() {
        InternalResourceViewResolver resolver = new InternalResourceViewResolver();
        resolver.setPrefix("/WEB-INF/views/");
        resolver.setSuffix(".jsp");
        return resolver;
    }
    @Override
    public void configureDefaultServletHandling(DefaultServletHandlerConfigurer configurer) {
        configurer.enable();
    }
    /*
     * Configures content-negotiation.
     */
    @Configuration
    public static class ContentNegotiationConfig extends WebMvcConfigurerAdapter {
        @Bean
        public ViewResolver cnViewResolver(ContentNegotiationManager contentNegotiationManager) {
            ContentNegotiatingViewResolver contentNegotiatingViewResolver = new ContentNegotiatingViewResolver();
            contentNegotiatingViewResolver.setContentNegotiationManager(contentNegotiationManager);
            return contentNegotiatingViewResolver;
        }
        @Override
        public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
            configurer.defaultContentType(MediaType.TEXT_HTML);
        }
        @Bean
        public ViewResolver beanNameViewResolver() {
            return new BeanNameViewResolver();
        }
        @Bean
        public View spittles() {
            return new MappingJackson2JsonView();
        }
    }
}
```

能够处理HTML的视图解析器（如InternalResourceViewResolver或TilesViewResolver）。在大多数场景下，ContentNegotiatingViewResolver会假设客户端需要HTML，如ContentNegotiationManager配置所示。但是，如果客户端指定了它想要JSON（通过在请求路径上使用“.json”扩展名或Accept头部信息）的话，那么ContentNegotiatingViewResolver将会查找能够处理JSON视图的视图解析器。

如果逻辑视图的名称为“spittles”，那么我们所配置的BeanNameViewResolver将会解析spittles()方法中所声明的View。这是因为bean名称匹配逻辑视图的名称。如果没有匹配的View的话，ContentNegotiatingViewResolver将会采用默认的行为，将其输出为HTML。

**ContentNegotiatingViewResolver的优势与限制**

* ContentNegotiatingViewResolver最大的优势在于，它在Spring MVC之上构建了REST资源表述层，控制器代码无需修改。相同的一套控制器方法能够为面向人类的用户产生HTML内容，也能针对不是人类的客户端产生JSON或XML。
* 如果面向人类用户的接口与面向非人类客户端的接口之间有很多重叠的话，那么内容协商是一种很便利的方案。在实践中，面向人类用户的视图与REST API在细节上很少能够处于相同的级别。如果面向人类用户的接口与面向非人类客户端的接口之间没有太多重叠的话，那么ContentNegotiatingViewResolver的优势就体现不出来了。
* ContentNegotiatingViewResolver还有一个严重的限制。作为ViewResolver的实现，它只能决定资源该如何渲染到客户端，并没有涉及到客户端要发送什么样的表述给控制器使用。如果客户端发送JSON或XML的话，那么ContentNegotiatingViewResolver就无法提供帮助了。
* 另外一个小问题是Model是Map结构，所以返回的Json中必须带有key

**HTTP信息转换器**

消息转换（message conversion）提供了一种更为直接的方式，它能够将控制器产生的数据转换为服务于客户端的表述形式。当使用消息转换功能时，DispatcherServlet不再需要那么麻烦地将模型数据传送到视图中。实际上，这里根本就没有模型，也没有视图，只有控制器产生的数据，以及消息转换器（message converter）转换数据之后所产生的资源表述。

Spring提供了多个HTTP信息转换器，用于实现资源表述与各种Java类型之间的互相转换：

|              信息转换器              |                                                                                                          描述                                                                                                         |
|--------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| AtomFeedHttpMessageConverter         | Rome Feed对象和Atom feed（媒体类型application/atom+xml）之间的互相转换。</br>如果 Rome 包在类路径下将会进行注册                                                                                                           |
| BufferedImageHttpMessageConverter    | BufferedImages与图片二进制数据之间互相转换                                                                                                                                                                            |
| ByteArrayHttpMessageConverter        | 读取/写入字节数组。从所有媒体类型（`*/*`）中读取，并以application/octet-stream格式写入                                                                                                                                  |
| FormHttpMessageConverter             | 将application/x-www-form-urlencoded内容读入到`MultiValueMap<String,String>`中，也会将`MultiValueMap<String,String>`写入到application/x-www-form-urlencoded中或将`MultiValueMap<String, Object>`写入到multipart/form-data中 |
| Jaxb2RootElementHttpMessageConverter | 在XML（text/xml或application/xml）和使用JAXB2注解的对象间互相读取和写入。</br>如果 JAXB v2 库在类路径下，将进行注册                                                                                                        |
| MappingJacksonHttpMessageConverter   | 在JSON和类型化的对象或非类型化的HashMap间互相读取和写入。 </br>如果 Jackson JSON 库在类路径下，将进行注册                                                                                                                  |
| MappingJackson2HttpMessageConverter  | 在JSON和类型化的对象或非类型化的HashMap间互相读取和写入。</br>如果 Jackson 2 JSON 库在类路径下，将进行注册                                                                                                                 |
| MarshallingHttpMessageConverter      | 使用注入的编排器和解排器（marshaller和unmarshaller）来读入和写入XML。支持的编排器和解排器包括Castor、JAXB2、JIBX、XMLBeans以及Xstream                                                                                 |
| ResourceHttpMessageConverter         | 读取或写入Resource                                                                                                                                                                                                    |
| RssChannelHttpMessageConverter       | 在RSS feed和Rome Channel对象间互相读取或写入。</br>如果 Rome 库在类路径下，将进行注册                                                                                                                                      |
| SourceHttpMessageConverter           | 在XML和javax.xml.transform.Source对象间互相读取和写入。</br>默认注册                                                                                                                                                       |
| StringHttpMessageConverter           | 将所有媒体类型（`*/*`）读取为String。将String写入为text/plain                                                                                                                                                           |
| XmlAwareFormHttpMessageConverter     | FormHttpMessageConverter的扩展，使用SourceHttp MessageConverter来支持基于XML的部分                                                                                                                                    |

**在响应体中返回资源状态**

正常情况下，当处理方法返回Java对象（除String外或View的实现以外）时，这个对象会放在模型中并在视图中渲染使用。
但是，如果使用了消息转换功能的话，我们需要告诉Spring跳过正常的模型/视图流程，并使用消息转换器。
有不少方式都能做到这一点，但是最简单的方法是为控制器方法添加@ResponseBody注解。

```java
@RequestMapping(value = "/{id}", method = RequestMethod.GET, produces = "application/json")
public @ResponseBody Spittle spittleById(@PathVariable Long id) {
    return spittleRepository.findOne(id);
}
```

@ResponseBody注解会告知Spring，我们要将返回的对象作为资源发送给客户端，并将其转换为客户端可接受的表述形式。更具体地讲，DispatcherServlet将会考虑到请求中Accept头部信息，并查找能够为客户端提供所需表述形式的消息转换器。

谈及Accept头部信息，请注意getSpitter()的@RequestMapping注解。在这里，我使用了produces属性表明这个方法只处理预期输出为JSON的请求。也就是说，这个方法只会处理Accept头部信息包含“application/json”的请求。其他任何类型的请求，即使它的URL匹配指定的路径并且是GET请求也不会被这个方法处理。这样的请求会被其他的方法来进行处理（如果存在适当方法的话），或者返回客户端HTTP 406（Not Acceptable）响应。

**在请求体中接收资源状态**

@RequestBody能告诉Spring查找一个消息转换器，将来自客户端的资源表述转换为对象。

```java
@RequestMapping(method = RequestMethod.POST, consumes = "application/json")
public Spittle saveSpittle(@RequestBody Spittle spittle) {
    return spittleRepository.save(spittle);
}
```

@RequestMapping有一个consumes属性，我们将其设置为“application/json”。consumes属性的工作方式类似于produces，不过它会关注请求的Content-Type头部信息。它会告诉Spring这个方法只会处理对“/spittles”的POST请求，并且要求请求的Content-Type头部信息为“application/json”。如果无法满足这些条件的话，会由其他方法（如果存在合适的方法的话）来处理请求。

**为控制器默认设置消息转换**

Spring 4.0引入了@RestController注解，能够在这个方面给我们提供帮助。如果在控制器类上使用@RestController来代替@Controller的话，Spring将会为该控制器的所有处理方法应用消息转换功能。我们不必为每个方法都添加@ResponseBody了。

```java
@RestController
@RequestMapping("/spittles")
public class SpittleApiController {
}
```

为控制器使用了@RestController，所以它的方法所返回的对象将会通过消息转换机制，产生客户端所需的资源表述。

**发送错误信息到客户端**

Spring提供了多种方式来处理这样的场景：

* 使用@ResponseStatus注解可以指定状态码
* 控制器方法可以返回ResponseEntity对象，该对象能够包含更多响应相关的元数据
* 异常处理器能够应对错误场景，这样处理器方法就能关注于正常的状况

**使用ResponseEntity**

作为@ResponseBody的替代方案，控制器方法可以返回一个ResponseEntity对象。ResponseEntity中可以包含响应相关的元数据（如头部信息和状态码）以及要转换成资源表述的对象。

```java
@RequestMapping(value = "/{id}", method = RequestMethod.GET, produces = "application/json")
public ResponseEntity<Spittle> spittleById(@PathVariable Long id) {
    Spittle spittle = spittleRepository.findOne(id);
    HttpStatus httpStatus = spittle == null ? HttpStatus.NOT_FOUND : HttpStatus.OK;
    return new ResponseEntity<>(spittle, httpStatus);
}
```

除了包含响应头信息、状态码以及负载以外，ResponseEntity还包含了@ResponseBody的语义，如果返回ResponseEntity的话，那就没有必要在方法上使用@ResponseBody注解了。

```java
public @ResponseBody Error spittleNotFound(SpittleNotFoundException e) {
    long spittleId = e.getSpittleId();
    return new Error(4, "Spittle [" + spittleId + "] not found");
}
```

```java
@RequestMapping(value = "/{id}", method = RequestMethod.GET, produces = "application/json")
public ResponseEntity<?> spittleById(@PathVariable Long id) {
    Spittle spittle = spittleRepository.findOne(id);
    if (spittle == null) {
        Error error = new Error(4, "Spittle [" + id + "] not found");
        return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
    }
    return new ResponseEntity<>(spittle, HttpStatus.OK);
}
```

**处理错误**

参考《HandlerExceptionResolver异常处理》

```java
public class SpittleNotFoundException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private long spittleId;
    public SpittleNotFoundException(long spittleId) {
        this.spittleId = spittleId;
    }
    public long getSpittleId() {
        return spittleId;
    }
}
```

```java
@ExceptionHandler(SpittleNotFoundException.class)
@ResponseStatus(HttpStatus.NOT_FOUND)
public Error spittleNotFound(SpittleNotFoundException e) {
    long spittleId = e.getSpittleId();
    return new Error(4, "Spittle [" + spittleId + "] not found");
}
```

```java
@RequestMapping(value = "/{id}", method = RequestMethod.GET, produces = "application/json")
public Spittle spittleById(@PathVariable Long id) {
    Spittle spittle = spittleRepository.findOne(id);
    if (spittle == null) {
        throw new SpittleNotFoundException(id);
    }
    return spittle;
}
```

这个版本的spittleById()方法确实干净了很多。除了对返回值进行null检查，它完全关注于成功的场景，也就是能够找到请求的Spittle。同时，在返回类型中，我们能移除掉奇怪的泛型了。

不过，我们能够让代码更加干净一些。现在我们已经知道spittleById()将会返回Spittle并且HTTP状态码始终会是200（OK），那么就可以不再使用ResponseEntity，而是将其替换为@ResponseBody，如果控制器类上使用了@RestController，我们甚至不再需要@ResponseBody

通过为异常处理方法添加@ResponseStatus(HttpStatus.NOT_FOUND)注解，我们可以达到相同的效果，而且可以不再使用ResponseEntity了。

**在响应中设置头部信息**

```java
@RequestMapping(method = RequestMethod.POST, consumes = "application/json")
@ResponseStatus(HttpStatus.CREATED)// 请求头201显示已创建
public ResponseEntity<Spittle> saveSpittle(@RequestBody Spittle spittle, UriComponentsBuilder ucb) {
    Spittle saved = spittleRepository.save(spittle);
    // 用于返回已创建的资源地址
    HttpHeaders headers = new HttpHeaders();
    URI locationUri = ucb.path("/spittles/")
            .path(String.valueOf(saved.getId()))
            .build()
            .toUri();
    headers.setLocation(locationUri);
    return new ResponseEntity<Spittle>(saved, headers, HttpStatus.CREATED);
}
```

**RestTemplate**

除了TRACE以外，RestTemplate涵盖了所有的HTTP动作。

大多数操作都以三种方法的形式进行了重载：

* 一个使用java.net.URI作为URL格式，不支持参数化URL
* 一个使用String作为URL格式，并使用Map指明URL参数
* 一个使用String作为URL格式，并使用可变参数列表指明URL参数

|        方法       |                                           描述                                          |
|-------------------|-----------------------------------------------------------------------------------------|
| delete()          | 在特定的URL上对资源执行HTTP DELETE操作                                                  |
| exchange()        | 在URL上执行特定的HTTP方法，返回包含对象的ResponseEntity，这个对象是从响应体中映射得到的 |
| execute()         | 在URL上执行特定的HTTP方法，返回一个从响应体映射得到的对象                               |
| getForEntity()    | 发送一个HTTP GET请求，返回的ResponseEntity包含了响应体所映射成的对象                    |
| getForObject()    | 发送一个HTTP GET请求，返回的请求体将映射为一个对象                                      |
| headForHeaders()  | 发送HTTP HEAD请求，返回包含特定资源URL的HTTP头                                          |
| optionsForAllow() | 发送HTTP OPTIONS请求，返回对特定URL的Allow头信息                                        |
| postForEntity()   | POST数据到一个URL，返回包含一个对象的ResponseEntity，这个对象是从响应体中映射得到的     |
| postForLocation() | POST数据到一个URL，返回新创建资源的URL                                                  |
| postForObject()   | POST数据到一个URL，返回根据响应体匹配形成的对象                                         |
| put()             | PUT资源到特定的URL                                                                      |

GET

```java
public Spittle getSpittle(String id) {
    Map<String, String> urlVariables = new HashMap<>();
    urlVariables.put("id", id);
    RestTemplate restTemplate = new RestTemplate();
    return restTemplate.getForObject("http://localhost/spittle/{id}", Spittle.class, urlVariables);
}
public Spittle[] getSpittles(String id) {
    Map<String, String> urlVariables = new HashMap<>();
    urlVariables.put("id", id);
    RestTemplate restTemplate = new RestTemplate();
    return restTemplate.getForObject("http://localhost/spittle/{id}", Spittle[].class, urlVariables);
}
```

```java
public Spittle getSpittle(String id) {
    Map<String, String> urlVariables = new HashMap<>();
    urlVariables.put("id", id);
    RestTemplate restTemplate = new RestTemplate();
    ResponseEntity<Spittle> entity = restTemplate.getForEntity("http://localhost/spittle/{id}", Spittle.class, urlVariables);
    if (entity.getStatusCode() != HttpStatus.NOT_FOUND) {
        throw new SpittleNotFoundException(id);
    }
    return entity.getBody();
}
```

PUT

```java
public void updateSpittle(Spittle spittle) {
    RestTemplate restTemplate = new RestTemplate();
    // String url = "http://localhost/spittle/" + spittle.getId();
    // restTemplate.put(URI.create(url), spittle);
    restTemplate.put("http://localhost/spittle/{id}", spittle, spittle.getId());
}
```

在所有版本的put()中，第二个参数都是表示资源的Java对象，它将按照指定的URI发送到服务器端。

对象将被转换成什么样的内容类型很大程度上取决于传递给put()方法的类型。如果给定一个String值，那么将会使用StringHttpMessageConverter：这个值直接被写到请求体中，内容类型设置为“text/plain”。如果给定一个MultiValueMap<String,String>，那么这个Map中的值将会被FormHttpMessageConverter以“application/x-www-form-urlencoded”的格式写到请求体中。

因为我们传递进来的是Spittle对象，所以需要一个能够处理任意对象的信息转换器。如果在类路径下包含Jackson 2库，那么MappingJacksonHttpMessageConverter将以application/json格式将Spittle写到请求中。

**DELETE**

```java
public void deleteSpittle(String id) {
    RestTemplate restTemplate = new RestTemplate();
    restTemplate.delete("http://localhost/spittle/{id}", id);
}
```

**POST**

```java
public Spittle postSpittleForObject(Spittle spittle) {
    RestTemplate restTemplate = new RestTemplate();
    Spittle result = restTemplate.postForObject("http://localhost/spittle/add", spittle, Spittle.class);
    return result;
}
```

```java
public Spittle postSpittleForObject(Spittle spittle) {
    RestTemplate restTemplate = new RestTemplate();
    ResponseEntity<Spittle> spittleResponseEntity = restTemplate.postForEntity("http://localhost/spittle/add", spittle, Spittle.class);
    if (spittleResponseEntity.getStatusCode() != HttpStatus.CREATED) {
        throw new SpittleAlreadyExistFoundException(spittle.getId());
    }
    URI location = spittleResponseEntity.getHeaders().getLocation();
    return spittleResponseEntity.getBody();
}
```

```java
public String postSpittleForLocation(Spittle spittle) {
    RestTemplate restTemplate = new RestTemplate();
    return restTemplate.postForLocation("http://localhost/spittle/add", spittle).toString();
}
```

**通过exchange设置请求头**

```java
public Spittle exchangeSpittleForJson(String id) {
    RestTemplate restTemplate = new RestTemplate();
    MultiValueMap<String, String> multiValueMap = new HttpHeaders();
    multiValueMap.add(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE);
    HttpEntity<Object> requestHttpEntity = new HttpEntity<>(multiValueMap);
    ResponseEntity<Spittle> exchange = restTemplate.exchange("http://localhost/spittle/{id}", HttpMethod.GET, requestHttpEntity, Spittle.class, id);
    return exchange.getBody();
}
```

##### 拦截器

```xml
<mvc:interceptors>
    <!--多个拦截器顺序执行-->
    <mvc:interceptor>
        <mvc:mapping path="/**"/>
        <bean class="com.xpress.interceptor.MyInterceptor"/>
    </mvc:interceptor>
    <mvc:interceptor>
        <mvc:mapping path="/**"/>
        <bean class="com.xpress.interceptor.MyInterceptor1"/>
    </mvc:interceptor>
</mvc:interceptors>
```

```java
public class MyInterceptor1 implements HandlerInterceptor {
    // handler执行之前
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        System.out.println(1);
        // 如果不放行，后面的拦截器所有方法不会执行，handler也不会执行，postHandle也不会执行,前面拦截器的afterCompletion会执行
        return true;
    }
    // 执行结束返回modelAndView之前
    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler, ModelAndView modelAndView) throws Exception {
        System.out.println(2);
    }
    // handler执行之后
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {
        System.out.println(3);
    }
}
```

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

ViewResolver接口

```java
public interface ViewResolver {
    View resolveViewName(String viewName, Locale locale) throws Exception;
}
```

View接口

```java
public interface View {
    String RESPONSE_STATUS_ATTRIBUTE = View.class.getName() + ".responseStatus";
    String PATH_VARIABLES = View.class.getName() + ".pathVariables";
    String SELECTED_CONTENT_TYPE = View.class.getName() + ".selectedContentType";
    String getContentType();
    void render(Map<String, ?> model, HttpServletRequest request, HttpServletResponse response) throws Exception;
}
```

Spring自带了13个视图解析器，能够将逻辑视图名转换为物理实现：

|           视图解析器           |                                                            描述                                                           |
|--------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| BeanNameViewResolver           | 将视图解析为Spring应用上下文中的bean，其中bean的ID与视图的名字相同                                                            |
| ContentNegotiatingViewResolver | 通过考虑客户端需要的内容类型来解析视图，委托给另外一个能够产生对应内容类型的视图解析器                                        |
| FreeMarkerViewResolver         | 将视图解析为FreeMarker模板                                                                                                    |
| InternalResourceViewResolver   | 将视图解析为Web应用的内部资源（一般为JSP）                                                                                    |
| JasperReportsViewResolver      | 将视图解析为JasperReports定义                                                                                                 |
| ResourceBundleViewResolver     | 将视图解析为资源bundle（一般为属性文件）                                                                                      |
| TilesViewResolver              | 将视图解析为Apache Tile定义，其中tile ID与视图名称相同。注意有两个不同的TilesViewResolver实现，分别对应于Tiles 2.0和Tiles 3.0 |
| UrlBasedViewResolver           | 直接根据视图的名称解析视图，视图的名称会匹配一个物理视图的定义                                                                |
| VelocityLayoutViewResolver     | 将视图解析为Velocity布局，从不同的Velocity模板中组合页面                                                                      |
| VelocityViewResolver           | 将视图解析为Velocity模板                                                                                                      |
| XmlViewResolver                | 将视图解析为特定XML文件中的bean定义。类似于BeanName-ViewResolver                                                              |
| XsltViewResolver               | 将视图解析为XSLT转换后的结果                                                                                                  |


根据逻辑视图名解析真正的view

```xml
<!--视图解析器：解析jsp，默认使用jstl标签，classpath下要有jstl包-->
<bean class="org.springframework.web.servlet.view.InternalResourceViewResolver">
    <!--配置jsp前缀和后缀，可以简化返回结果配置-->
    <!--modelAndView.setViewName("myProfile");-->
    <property name="suffix" value=".jsp"/>
    <property name="prefix" value="/WEB-INF/pages/"/>
    <!-- for jstl -->
    <!-- <beans:property name="viewClass" value="org.springframework.web.servlet.view.JstlView"/> -->
</bean>
```

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

org.springframework.web.servlet.ViewResolver=org.springframework.web.servlet.view.InternalResourceViewResolver
```

### HandlerExceptionResolver异常处理

参考《REST》部分的异常处理

Spring提供了多种方式将异常转换为响应：

* 特定的Spring异常将会自动映射为指定的HTTP状态码
* 异常上可以添加@ResponseStatus注解，从而将其映射为某一个HTTP状态码
* 在方法上可以添加@ExceptionHandler注解，使其用来处理异常

在默认情况下，Spring会将自身的一些异常自动转换为合适的状态码：

|                Spring异常               |          HTTP状态码          |
|-----------------------------------------|------------------------------|
| BindException                           | 400 - Bad Request            |
| ConversionNotSupportedException         | 500 - Internal Server Error  |
| HttpMediaTypeNotAcceptableException     | 406 - Not Acceptable         |
| HttpMediaTypeNotSupportedException      | 415 - Unsupported Media Type |
| HttpMessageNotReadableException         | 400 - Bad Request            |
| HttpMessageNotWritableException         | 500 - Internal Server Error  |
| HttpRequestMethodNotSupportedException  | 405 - Method Not Allowed     |
| MethodArgumentNotValidException         | 400 - Bad Request            |
| MissingServletRequestParameterException | 400 - Bad Request            |
| MissingServletRequestPartException      | 400 - Bad Request            |
| NoSuchRequestHandlingMethodException    | 404 - Not Found              |
| TypeMismatchException                   | 400 - Bad Request            |

**@ResponseStatus注解**

将异常映射为状态码：

```java
@ResponseStatus(value=HttpStatus.NOT_FOUND, reason="User Not Found")
public class UserNotFoundException extends RuntimeException {

}
```

**异常处理方法**

@ExceptionHandle注解处理当前Controller所有方法的指定异常

```java
@Controller
@RequestMapping("/user")
public class UserController {
    @ExceptionHandler(DuplicateUserException.class)
    public String handleNotFound() {
        return "error/duplicate";
    }
}
```

**公共异常处理**

控制器通知：

Spring 3.2引入了一个新的解决方案：控制器通知。

控制器通知（controller advice）是任意带有@ControllerAdvice注解的类，这个类会包含一个或多个如下类型的方法：

* @ExceptionHandler注解标注的方法
* @InitBinder注解标注的方法
* @ModelAttribute注解标注的方法

在带有@ControllerAdvice注解的类中，以上所述的这些方法会运用到整个应用程序所有控制器中带有@RequestMapping注解的方法上。

```java
@ControllerAdvice
public class AppWideExceptionHandler {
    @ExceptionHandler(DuplicateUserException.class)
    public String handleNotFound() {
        return "error/duplicate";
    }
}
```

HandlerExceptionResolver接口：

```java
// 实现接口被spring加载后自动识别为HandlerExceptionResolver
@Component
public class ServiceExceptionHandler implements HandlerExceptionResolver {
    private static final Logger LOGGER = LoggerFactory.getLogger(ServiceExceptionHandler.class);
    @Resource
    private ResourceBundleMessageSource messageSource;

    @Override
    public ModelAndView resolveException(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        String message;
        if (ex instanceof ServiceException) {
            message = ex.getMessage();
        } else {
            LOGGER.error(ex.getMessage(), ex);
            message = messageSource.getMessage("errorMessage.unknown", null, request.getLocale());
        }
        ModelAndView modelAndView = new ModelAndView();
        modelAndView.addObject("message", message);
        modelAndView.setViewName("message");
        return modelAndView;
    }
}
```

## SpringMVC和Struts2区别

* SpringMVC基于方法开发，Struts2基于类开发（单例和多例）

## Spring Web Flow

### 配置

#### 命名空间

```xml
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xmlns:flow="http://www.springframework.org/schema/webflow-config"
       xmlns:p="http://www.springframework.org/schema/p"
       xmlns:context="http://www.springframework.org/schema/context"
       xsi:schemaLocation="http://www.springframework.org/schema/webflow-config
   http://www.springframework.org/schema/webflow-config/spring-webflow-config-2.3.xsd
   http://www.springframework.org/schema/beans 
   http://www.springframework.org/schema/beans/spring-beans-3.0.xsd
   http://www.springframework.org/schema/context 
   http://www.springframework.org/schema/context/spring-context-3.0.xsd">

</beans>
```

#### 流程执行器

流程执行器（flow executor）驱动流程的执行。当用户进入一个流程时，流程执行器会为用户创建并启动一个流程执行实例。当流程暂停的时候（如为用户展示视图时），流程执行器会在用户执行操作后恢复流程。

尽管流程执行器负责创建和执行流程，但它并不负责加载流程定义。

```xml
<flow:flow-executor id="flowExecutor"/>
```

#### 流程注册表

流程注册表（flow registry）的工作是加载流程定义并让流程执行器能够使用它们。

```xml
<flow:flow-registry id="flowRegistry" base-path="/WEB-INF/flows">
    <flow:flow-location-pattern value="/**/*-flow.xml"/>
</flow:flow-registry>
```

**流程Id**

在使用流程定位模式的时候，流程定义文件相对于基本路径的路径将被用作流程的ID，就是相对于base-path的路径——或者双星号所代表的路径。

![flow-id](/static/img/spring-mvc/flow-id.png "flow-id")

当我们这样配置的话，流程的ID是从流程定义文件的文件名中获得的，在这里就是springpizza。

```xml
<!-- The registry of executable flow definitions -->
<flow:flow-registry>
    <flow:flow-location path="/WEB-INF/flows/pizza/springpizza.xml"/>
</flow:flow-registry>
```

更显式地指定流程ID

```xml
<flow:flow-registry>
    <flow:flow-location id="pizza" path="/WEB-INF/flows/pizza/pizza-flow.xml"/>
</flow:flow-registry>
```

#### 处理请求

DispatcherServlet一般将请求分发给控制器。但是对于流程而言，我们需要一个FlowHandlerMapping来帮助DispatcherServlet将流程请求发送给Spring Web Flow。

```xml
<!--Maps request paths to flows in the flowRegistry-->
<bean class="org.springframework.webflow.mvc.servlet.FlowHandlerMapping">
    <property name="flowRegistry" ref="flowRegistry"/>
</bean>
```

FlowHandlerMapping的工作仅仅是将流程请求定向到Spring Web Flow上，响应请求的是FlowHandlerAdapter。FlowHandlerAdapter等同于Spring MVC的控制器，它会响应发送的流程请求并对其进行处理。

```xml
<!--Dispatches requests mapped to flows to FlowHandler implementations-->
<bean class="org.springframework.webflow.mvc.servlet.FlowHandlerAdapter">
    <property name="flowExecutor" ref="flowExecutor"/>
</bean>
```

这个处理适配器是DispatcherServlet和Spring Web Flow之间的桥梁。它会处理流程请求并管理基于这些请求的流程。在这里，它装配了流程执行器的引用，而后者是为所处理的请求执行流程的。

### 流程的组件

在Spring Web Flow中，流程是由三个主要元素定义的：状态、转移和流程数据。

#### 状态

Spring Web Flow定义了五种不同类型的状态

|      状态类型     |                          它是用来做什么的                          |
|-------------------|--------------------------------------------------------------------|
| 行为（Action）    | 行为状态是流程逻辑发生的地方                                       |
| 决策（Decision）  | 决策状态将流程分成两个方向，它会基于流程数据的评估结果确定流程方向 |
| 结束（End）       | 结束状态是流程的最后一站。一旦进入End状态，流程就会终止            |
| 子流程（Subflow） | 子流程状态会在当前正在运行的流程上下文中启动一个新的流程           |
| 视图（View）      | 视图状态会暂停流程并邀请用户参与流程                               |

##### 视图状态

视图状态用于为用户展现信息并使用户在流程中发挥作用。实际的视图实现可以是Spring支持的任意视图类型

```xml
<!-- id和视图名都为welcome -->
<view-state id="welcome"/>
<!-- 指定视图名 -->
<view-state id="welcome" view="greeting"/>
<!-- 绑定表单对象 -->
<view-state id="welcome" model="flowScope.paymentDetails"/>
```

##### 行为状态

行为状态是应用程序自身在执行任务。行为状态一般会触发Spring所管理bean的一些方法并根据方法调用的执行结果转移到另一个状态。

```xml
<action-state id="lookupCustomer">
    <!-- 给出行为状态要做的事情，expression是SpEL，指定了进入这个状态时要评估的表达式 -->
    <evaluate result="order.customer" expression="pizzaFlowActions.lookupCustomer(requestParameters.phoneNumber)"/>
    <!-- 转移 -->
    <transition to="registrationForm" on-exception="com.springinaction.pizza.service.CustomerNotFoundException"/>
    <transition to="customerReady"/>
</action-state>
```

##### 决策状态

有可能流程会完全按照线性执行，从一个状态进入另一个状态，没有其他的替代路线。但是更常见的情况是流程在某一个点根据流程的当前情况进入不同的分支。

决策状态能够在流程执行时产生两个分支。

```xml
<decision-state id="checkDeliveryArea">
    <!-- 评估一个boolean类型的SpEL -->
    <if test="pizzaFlowActions.checkDeliveryArea(order.customer.zipCode)"
        then="addCustomer"
        else="deliveryWarning"/>
</decision-state>
```

##### 子流程状态

subflow-state允许在一个正在执行的流程中调用另一个流程。这类似于在一个方法中调用另一个方法。

```xml
<subflow-state id="order" subflow="pizza/order">
    <!-- 传递订单到子流程输入 -->
    <input name="order" value="order"/>
    <!-- 传出，使用orderId填充order的id -->
    <output name="orderId" value="order.id"/>
    <!-- 如果子流程结束的end-state状态Id为orderCreated，则转移到payment状态 -->
    <transition on="orderCreated" to="payment"/>
</subflow-state>
```

##### 结束状态

```xml
<end-state id="endState"/>
```

流程结束后发生什么取决于几个因素：

* 如果结束的流程是一个子流程，那调用它的流程将会从`<subflow-state>`处继续执行。`<end-state>`的ID将会用作事件触发从`<subflow-state>`开始的转移。
* 如果`<end-state>`设置了view属性，指定的视图将会被渲染。视图可以是相对于流程路径的视图模板，如果添加“externalRedirect:”前缀的话，将会重定向到流程外部的页面，如果添加“flowRedirect:”将重定向到另一个流程中。
* 如果结束的流程不是子流程，也没有指定view属性，那这个流程只是会结束而已。浏览器最后将会加载流程的基本URL地址，当前已没有活动的流程，所以会开始一个新的流程实例。

#### 转移

转移连接了流程中的状态。流程中除结束状态之外的每个状态，至少都需要一个转移，这样就能够知道一旦这个状态完成时流程要去向哪里。状态可以有多个转移，分别对应于当前状态结束时可以执行的不同的路径。

转移使用`<transition>`元素来进行定义，它会作为各种状态元素（`<action-state>`、`<view-state>`、`<subflow-state>`）的子元素。

只使用了to属性，那这个转移就会是当前状态的默认转移选项，如果没有其他可用转移的话，就会使用它。

```xml
<transition to="login"/>
```

更常见的转移定义是基于事件的触发来进行的。

* 在视图状态，事件通常会是用户采取的动作
* 在行为状态，事件是评估表达式得到的结果
* 在子流程状态，事件取决于子流程结束状态的ID

```xml
<transition on="orderCreated" to="payment"/>
```

在抛出异常时，流程也可以进入另一个状态。

```xml
<transition to="registrationForm" on-exception="com.springinaction.pizza.service.CustomerNotFoundException"/>
```

##### 全局转移

定义完这个全局转移后，流程中的所有状态都会默认拥有这个cancel转移。

```xml
<global-transitions>
    <transition on="cancel" to="endState"/>
</global-transitions>
```

#### 流程数据

##### 声明变量

定义变量

```xml
<var name="order" class="com.springinaction.pizza.domain.Order"/>
```

作为行为状态的一部分或者作为视图状态的入口，你有可能会使用`<evaluate>`元素来创建变量。

```xml
<evaluate result="viewScope.toppingsList" expression="T(com.springinaction.pizza.domain.Topping).asList()" />
```

`<set>`元素也可以设值变量的值：

```xml
<set name="flowScope.pizza" value="new com.springinaction.pizza.domain.Pizza()" />
```

##### 定义流程数据的作用域

流程中携带的数据会拥有不同的生命作用域和可见性，这取决于保存数据的变量本身的作用域。

|   范围   |                                      生命作用域和可见性                                      |
|--------------|----------------------------------------------------------------------------------------------|
| Conversation | 最高层级的流程开始时创建，在最高层级的流程结束时销毁。被最高层级的流程和其所有的子流程所共享 |
| Flow         | 当流程开始时创建，在流程结束时销毁。只有在创建它的流程中是可见的                             |
| Request      | 当一个请求进入流程时创建，在流程返回时销毁                                                   |
| Flash        | 当流程开始时创建，在流程结束时销毁。在视图状态渲染后，它也会被清除                           |
| View         | 当进入视图状态时创建，当这个状态退出时销毁。只在视图状态内是可见的                           |

当使用`<var>`元素声明变量时，变量始终是流程作用域的，也就是在定义变量的流程内有效。当使用`<set>`或`<evaluate>`的时候，作用域通过name或result属性的前缀指定。

```xml
<set name="flowScope.theAnswer" value="42" />
```

### 流程

#### 定义基本流程

`<flow>`的start-state属性将任意状态设为开始状态

```xml
<flow xmlns="http://www.springframework.org/schema/webflow"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.springframework.org/schema/webflow 
  http://www.springframework.org/schema/webflow/spring-webflow-2.0.xsd" start-state="welcome">
    <view-state id="welcome">
        <transition on="phoneEntered" to="lookupCustomer"/>
        <transition on="cancel" to="endState"/>
    </view-state>
    <view-state id="thankYou">
        <transition to="endState"/>
    </view-state>
    <!-- End state -->
    <end-state id="endState"/>
</flow>
```

thankYou.jsp

```html
<%@ taglib prefix="form" uri="http://www.springframework.org/tags/form" %>
<html>

<head><title>Spring Pizza</title></head>

<body>
<h2>Thank you for your order!</h2>
<!-- 三种方式到达finish -->
<form:form>
    <input type="hidden" name="_flowExecutionKey" value="${flowExecutionKey}"/>
    <input type="submit" name="_eventId_finished" value="Finished"/>
</form:form>
<form:form>
    <input type="hidden" name="_flowExecutionKey" value="${flowExecutionKey}"/>
    <input type="hidden" name="_eventId" value="finished"/>
    <input type="submit" value="Finished"/>
</form:form>
<a href='${flowExecutionUrl}&_eventId=finished'>Finish</a>
</body>
</html>
```

Spring Web Flow为视图的用户提供了一个flowExecutionUrl变量，它包含了流程的URL。结束链接将一个“_eventId”参数关联到URL上，以便回到Web流程时触发finished事件。这个事件将会让流程到达结束状态。

流程将会在结束状态完成。鉴于在流程结束后没有下一步做什么的具体信息，流程将会重新头开始

```xml
<form:form>
    <input type="hidden" name="_flowExecutionKey" value="${flowExecutionKey}"/>
    <input type="text" name="phoneNumber"/><br/>
    <input type="submit" name="_eventId_phoneEntered" value="Lookup Customer" />
</form:form>
```

隐藏的“_flowExecutionKey”输入域。当进入视图状态时，流程暂停并等待用户采取一些行为。赋予视图的流程执行key（flow execution key）就是一种返回流程的“回程票”（claim ticket）。当用户提交表单时，流程执行key会在“_flowExecutionKey”输入域中返回并在流程暂停的位置进行恢复。

按钮名字的“_eventId_”部分是提供给Spring Web Flow的一个线索，它表明了接下来要触发事件。当点击这个按钮提交表单时，会触发phoneEntered事件进而转移到lookupCustomer。

```html
<%@ taglib prefix="form" uri="http://www.springframework.org/tags/form" %>
<form:input path="customer.phoneNumber"/>
```

使用spring的form标签可以使框架自动绑定数据到实体

```xml
<end-state id="customerReady">
    <output name="customer"/>
</end-state>
```

`<output>`元素返回customer流程变量，这样在披萨流程中，就能够将identifyCustomer子流程的状态指定给订单。

```xml
<flow xmlns="http://www.springframework.org/schema/webflow"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.springframework.org/schema/webflow
      http://www.springframework.org/schema/webflow/spring-webflow-2.0.xsd">
    <!-- 接收order作为输入 -->
    <input name="order" required="true"/>
```

```xml
<view-state id="createPizza" model="flowScope.pizza">
    <!-- execute when this state is entered. -->
    <!-- <on-entry>元素添加了一个新的Pizza对象到流程作用域内，当表单提交时，表单的内容会填充到该对象中。 -->
    <on-entry>
        <set name="flowScope.pizza" value="new com.springinaction.pizza.domain.Pizza()"/>
        <evaluate result="viewScope.toppingsList" expression="T(com.springinaction.pizza.domain.Topping).asList()"/>
    </on-entry>
    <transition on="addPizza" to="showOrder">
        <evaluate expression="order.addPizza(flowScope.pizza)"/>
    </transition>
    <transition on="cancel" to="showOrder"/>
</view-state>
```

## Spring Security

Spring Security从两个角度来解决安全性问题。

* 使用Servlet规范中的Filter保护Web请求并限制URL级别的访问。
* 使用Spring AOP保护方法调用——借助于对象代理和使用通知，能够确保只有具备适当权限的用户才能访问安全保护的方法。

### Spring Security的模块

Spring Security被分成了11个模块

|           模块          |                                               描述                                               |
|-------------------------|--------------------------------------------------------------------------------------------------|
| ACL                     | 支持通过访问控制列表（access control list，ACL）为域对象提供安全性                               |
| 切面（Aspects）         | 一个很小的模块，当使用Spring Security注解时，会使用基于AspectJ的切面，而不是使用标准的Spring AOP |
| CAS客户端（CAS Client） | 提供与Jasig的中心认证服务（Central Authentication Service，CAS）进行集成的功能                   |
| 配置（Configuration）   | 包含通过XML和Java配置Spring Security的功能支持                                                   |
| 核心（Core）            | 提供Spring Security基本库                                                                        |
| 加密（Cryptography）    | 提供了加密和密码编码的功能                                                                       |
| LDAP                    | 支持基于LDAP进行认证                                                                             |
| OpenID                  | 支持使用OpenID进行集中式认证                                                                     |
| Remoting                | 提供了对Spring Remoting的支持                                                                    |
| 标签库（Tag Library）   | Spring Security的JSP标签库                                                                       |
| Web                     | 提供了Spring Security基于Filter的Web安全性支持                                                   |

应用程序的类路径下至少要包含Core和Configuration这两个模块。Spring Security经常被用于保护Web应用，需要添加Web模块。

### 过滤Web请求

Spring Security借助一系列Servlet Filter来提供各种安全性功能。

Spring Security配置在Web安全性之中，这里会有一个名为springSecurityFilterChain的Filter bean，DelegatingFilterProxy会将过滤逻辑委托给它。

springSecurityFilterChain本身是另一个特殊的Filter，它也被称为FilterChainProxy。它可以链接任意一个或多个其他的Filter。Spring Security依赖一系列Servlet Filter来提供不同的安全特性。

![spring-security-delegate](/static/img/spring-mvc/spring-security-delegate.png "spring-security-delegate")

```xml
<filter>
    <filter-name>springSecurityFilterChain</filter-name>
    <filter-class>org.springframework.web.filter.DelegatingFilterProxy</filter-class>
</filter>
<filter-mapping>
    <filter-name>springSecurityFilterChain</filter-name>
    <url-pattern>/*</url-pattern>
</filter-mapping>
```

AbstractSecurityWebApplicationInitializer实现了WebApplication-Initializer，因此Spring会发现它，并用它在Web容器中注册DelegatingFilterProxy。

尽管我们可以重载它的appendFilters()或insertFilters()方法来注册自己选择的Filter，但是要注册DelegatingFilterProxy的话，我们并不需要重载任何方法。

```java
import org.springframework.security.web.context.AbstractSecurityWebApplicationInitializer;
public class SecurityWebInitializer extends AbstractSecurityWebApplicationInitializer {
}
```

### 配置

Spring Security必须配置在一个实现了WebSecurityConfigurer的bean中，或者（简单起见）扩展WebSecurityConfigurerAdapter。

@EnableWebSecurity可以启用任意Web应用的安全性功能，不过，如果你的应用碰巧是使用Spring MVC开发的，那么就应该考虑使用@EnableWebMvcSecurity替代它

* 除了其他的内容以外，@EnableWebMvcSecurity注解还配置了一个Spring MVC参数解析解析器（argument resolver），这样的话处理器方法就能够通过带有@AuthenticationPrincipal注解的参数获得认证用户的principal（或username）。
* 它同时还配置了一个bean，在使用Spring表单绑定标签库来定义表单时，这个bean会自动添加一个隐藏的跨站请求伪造（cross-site request forgery，CSRF）token输入域。

通过重载WebSecurityConfigurerAdapter的三个configure()方法来配置Web安全性，这个过程中会使用传递进来的参数设置行为。

|                   方法                  |              描述             |
|-----------------------------------------|-------------------------------|
| configure(WebSecurity)                  | 配置Spring Security的Filter链 |
| configure(HttpSecurity)                 | 配置如何通过拦截器保护请求    |
| configure(AuthenticationManagerBuilder) | 配置user-detail服务           |


```java
@Configuration
// @EnableWebSecurity
@EnableWebMvcSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        // 不做覆盖的实现，要求全部认证
        http
                .authorizeRequests()
                    .anyRequest().authenticated()
                    .and()
                .formLogin().and()
                .httpBasic();
    }
    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        // 配置用户存储
        // 指定哪些请求需要认证，哪些请求不需要认证，以及所需要的权限
        // 提供一个自定义的登录页面，替代原来简单的默认登录页
        auth
                .inMemoryAuthentication()
                .withUser("user").password("password").roles("USER");
    }
}
```

### 选择查询用户详细信息的服务

Spring Security非常灵活，能够基于各种数据存储来认证用户。它内置了多种常见的用户存储场景，如内存、关系型数据库以及LDAP。也可以编写并插入自定义的用户存储实现。

#### 基于内存的用户存储

对于调试和开发人员测试来讲，基于内存的用户存储是很有用的

```java
@Override
protected void configure(AuthenticationManagerBuilder auth) throws Exception {
    auth
            .inMemoryAuthentication()
            .withUser("user").password("password").roles("USER").and()
            .withUser("admin").password("password").roles("USER","ADMIN");
}
```

UserDetailsManagerConfigurer.UserDetailsBuilder对象所有可用的方法：

|                    方法                   |          描述          |
|-----------------------------------------------|----------------------------|
| accountExpired(boolean)                       | 定义账号是否已经过期       |
| accountLocked(boolean)                        | 定义账号是否已经锁定       |
| and()                                         | 用来连接配置               |
| authorities(GrantedAuthority...)              | 授予某个用户一项或多项权限 |
| authorities(`List<? extends GrantedAuthority>`) | 授予某个用户一项或多项权限 |
| authorities(String...)                        | 授予某个用户一项或多项权限 |
| credentialsExpired(boolean)                   | 定义凭证是否已经过期       |
| disabled(boolean)                             | 定义账号是否已被禁用       |
| password(String)                              | 定义用户的密码             |
| roles(String...)                              | 授予某个用户一项或多项角色 |

roles()方法是authorities()方法的简写形式。roles()方法所给定的值都会添加一个“ROLE_”前缀，并将其作为权限授予给用户。

```java
// 等价配置
.withUser("user").password("password").authorities("ROLE_USER").and()
```

#### 基于数据库表进行认证

```java
@Resource
private DataSource dataSource;
@Override
protected void configure(AuthenticationManagerBuilder auth) throws Exception {
    auth
            .jdbcAuthentication()// 启动数据库认证
            .dataSource(dataSource)// 指定数据源
            // 自定义认证查询
            .usersByUsernameQuery("select username,password,true from users where username=?")
            // 自定义权限查询
            .authoritiesByUsernameQuery("select username,'ROLE_USER' from users where username=?")
            .passwordEncoder(new StandardPasswordEncoder("53cr3t"));
}
```

将默认的SQL查询替换为自定义的设计时，很重要的一点就是要遵循查询的基本协议。

所有查询都将用户名作为唯一的参数。

* 认证查询会选取用户名、密码以及启用状态信息。
* 权限查询会选取零行或多行包含该用户名及其权限信息的数据。
* 群组权限查询会选取零行或多行数据，每行数据中都会包含群组ID、群组名称以及权限。

Spring Security默认的查询SQL：

```java
public static final String DEF_USERS_BY_USERNAME_QUERY =
        "select username,password,enabled " +
        "from users " +
        "where username = ?";
public static final String DEF_AUTHORITIES_BY_USERNAME_QUERY =
        "select username,authority " +
        "from authorities " +
        "where username = ?";
public static final String DEF_GROUP_AUTHORITIES_BY_USERNAME_QUERY =
        "select g.id, g.group_name, ga.authority " +
        "from groups g, group_members gm, group_authorities ga " +
        "where gm.username = ? " +
        "and g.id = ga.group_id " +
        "and g.id = gm.group_id";
```

**密码加密**

passwordEncoder()方法可以接受Spring Security中PasswordEncoder接口的任意实现。

Spring Security的加密模块包括了三个这样的实现：

* BCryptPasswordEncoder
* NoOpPasswordEncoder
* StandardPasswordEncoder

用户在登录时输入的密码会按照相同的算法进行转码，然后再与数据库中已经转码过的密码进行对比。这个对比是在PasswordEncoder的matches()方法中进行的。

#### 基于LDAP进行认证

```java
@Override
protected void configure(AuthenticationManagerBuilder auth) throws Exception {
    auth
            .ldapAuthentication()
            .userSearchBase("ou=people")
            .userSearchFilter("(uid={0})")
            .groupSearchBase("ou=groups")
            .groupSearchFilter("member={0}")
            // 密码比对
            // .passwordCompare()
            // .passwordEncoder(new Md5PasswordEncoder())
            // .passwordAttribute("passcode");
            //嵌入式
            .contextSource().root("dc=habuma,dc=com")
            .ldif("classpath:users.ldif");
            //远程
            // .contextSource().url("ldap://habuma.com:389/dc=hubuma,dc=com");
}
```

#### 配置自定义的用户服务(Mongo、Neo4j等)

需要认证的用户存储在非关系型数据库中，如Mongo或Neo4j，在这种情况下，我们需要提供一个自定义的UserDetailsService接口实现。

实现loadUserByUsername()方法，根据给定的用户名来查找用户。loadUserByUsername()方法会返回代表给定用户的UserDetails对象。

```java
public class UserDetailsServiceImpl implements UserDetailsService {
    @Resource
    UsedrRepository UsedrRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        Usedr Usedr = UsedrRepository.findByUsername(username);
        if (Usedr != null) {
            List<GrantedAuthority> grantedAuthorities = new ArrayList<>();
            grantedAuthorities.add(new SimpleGrantedAuthority("ROLE_USER"));
            return new User(Usedr.getUsername(), Usedr.getPassword(), grantedAuthorities);
        }
        throw new UsernameNotFoundException("user not found");
    }
}
```

注册UserDetailsService

```java
@Override
protected void configure(AuthenticationManagerBuilder auth) throws Exception {
    auth.userDetailsService(new UserDetailsServiceImpl());
}
```

### 拦截请求

```java
@Override
protected void configure(HttpSecurity http) throws Exception {
    http
            .formLogin()
            .loginPage("/login")
            .and()
            .logout()
            .logoutSuccessUrl("/")
            .and()
            .rememberMe()
            .tokenRepository(new InMemoryTokenRepositoryImpl())
            .tokenValiditySeconds(2419200)
            .key("spittrKey")
            .and()
            .httpBasic()
            .realmName("Spittr")
            .and()
            .authorizeRequests()
            .antMatchers("/").authenticated()
            .antMatchers("/spitter/me").authenticated()
            .antMatchers(HttpMethod.POST, "/spittles").authenticated()
            .anyRequest().permitAll();
}
```

先调用authorizeRequests()，然后调用该方法所返回的对象的方法来配置请求级别的安全性细节。

* antMatchers()方法中设定的路径支持Ant风格的通配符。
* regexMatchers()方法则能够接受正则表达式来定义请求路径。

```java
// 等价配置
authorizeRequests()
    .antMatchers("/spitters/**").authenticated();
    .regexMatchers("/spitters/.*").authenticated();
    // 配置多个
    .antMatchers("/spitters/**","/spitters/mine").authenticated();
```

通过authenticated()和permitAll()来定义该如何保护路径

* authenticated()要求在执行该请求时，必须已经登录了应用。
    - 如果用户没有认证的话，Spring Security的Filter将会捕获该请求，并将用户重定向到应用的登录页面。
* permitAll()方法允许请求没有任何的安全限制。

用来定义如何保护路径的配置方法：

|                 方法                |                             能够做什么                              |
|-----------------------------------------|---------------------------------------------------------------------|
| access(String)                          | 如果给定的SpEL表达式计算结果为true，就允许访问                      |
| anonymous()                             | 允许匿名用户访问                                                    |
| authenticated()                         | 允许认证过的用户访问                                                |
| denyAll()                               | 无条件拒绝所有访问                                                  |
| fullyAuthenticated()                    | 如果用户是完整认证的话（不是通过Remember-me功能认证的），就允许访问 |
| hasAnyAuthority(String...)              | 如果用户具备给定权限中的某一个的话，就允许访问                      |
| hasAnyRole(String...)                   | 如果用户具备给定角色中的某一个的话，就允许访问                      |
| hasAuthority(String)                    | 如果用户具备给定权限的话，就允许访问                                |
| hasIpAddress(String)                    | 如果请求来自给定IP地址的话，就允许访问                              |
| hasRole(String)                         | 如果用户具备给定角色的话，就允许访问                                |
| not()                                   | 对其他访问方法的结果求反                                            |
| permitAll()                             | 无条件允许访问                                                      |
| rememberMe()    如果用户是通过Remember- | me功能认证的，就允许访问                                            |

```java
http
    .authorizeRequests()
    .antMatchers("/spitter/me").hasRole("SPITTER")
    .antMatchers(HttpMethod.POSt,"/spitles").hasRole("SPITTER")
    .anyRequest().permitAll();
```

我们可以将任意数量的antMatchers()、regexMatchers()和anyRequest()连接起来，以满足Web应用安全规则的需要。

这些规则会按照给定的顺序发挥作用。所以，很重要的一点就是将最为具体的请求路径放在前面，而最不具体的路径（如anyRequest()）放在最后面。如果不这样做的话，那不具体的路径配置将会覆盖掉更为具体的路径配置。

这些方法大多数都是一维的，也就是说我们可以使用hasRole()限制某个特定的角色，但是我们不能在相同的路径上同时通过hasIpAddress()限制特定的IP地址。

#### 使用Spring表达式进行安全保护

Spring Security通过一些安全性相关的表达式扩展了Spring表达式语言：

|        安全表达式         |                                     计算结果                                    |
|---------------------------|---------------------------------------------------------------------------------|
| authentication            | 用户的认证对象                                                                  |
| denyAll                   | 结果始终为false                                                                 |
| hasAnyRole(list of roles) | 如果用户被授予了列表中任意的指定角色，结果为true                                |
| hasRole(role)             | 如果用户被授予了指定的角色，结果为true                                          |
| hasIpAddress(IP Address)  | 如果请求来自指定IP的话，结果为true                                              |
| isAnonymous()             | 如果当前用户为匿名用户，结果为true                                              |
| isAuthenticated()         | 如果当前用户进行了认证的话，结果为true                                          |
| isFullyAuthenticated()    | 如果当前用户进行了完整认证的话（不是通过Remember-me功能进行的认证），结果为true |
| isRememberMe()            | 如果当前用户是通过Remember-me自动认证的，结果为true                             |
| permitAll                 | 结果始终为true                                                                  |
| principal                 | 用户的principal对象                                                             |

```java
.antMatchers("/spitter/me").access("hasRole('ROLE_SPITTER') and hasIpAddress('127.0.0.1')");
```

#### 强制通道的安全性

```java
http
    .authorizeRequests()
        .antMatchers("/spitter/me").hasRole("SPITTER")
    .and()
    .requiresChannel()
    .antMatchers("/spitter/form").requiresSecure();
```

使用requiresInsecure()代替requiresSecure()方法，将首页声明为始终通过HTTP传送

#### 防止跨站请求伪造

Spring Security通过一个同步token的方式来实现CSRF防护的功能。它将会拦截状态变化的请求（例如，非GET、HEAD、OPTIONS和TRACE的请求）并检查CSRF token。
如果请求中不包含CSRF token的话，或者token不能与服务器端的token相匹配，请求将会失败，并抛出CsrfException异常。

如果你使用Thymeleaf作为页面模板的话，只要`<form>`标签的action属性添加了Thymeleaf命名空间前缀，那么就会自动生成一个“_csrf”隐藏域：

```html
<form method="POST" th:action="@{/spitles}">
</form>
```

jsp:

```html
<input type="hidden" name="${_csrf.parameterName}" value="${_csrf.token}">
```

禁用CSRF保护：

```java
http
    .csrf().disable();
```

### 认证用户

#### 默认登录页和自定义登录页

```java
http
        .formLogin()// 启用默认的登录页
        .loginPage("/login")
```

```java
@Bean
public ViewResolver viewResolver(SpringTemplateEngine templateEngine) {
    ThymeleafViewResolver viewResolver = new ThymeleafViewResolver();
    viewResolver.setTemplateEngine(templateEngine);
    return viewResolver;
}
@Override
public void addViewControllers(ViewControllerRegistry registry) {
    // 映射login路径和login页面，使自定义页面生效
    registry.addViewController("/login").setViewName("customLoginView");
}
```

#### 启用HTTP Basic认证

HTTP Basic认证（HTTP Basic Authentication）会直接通过HTTP请求本身，对要访问应用程序的用户进行认证。

本质上，这是一个HTTP 401响应，表明必须要在请求中包含一个用户名和密码。在REST客户端向它使用的服务进行认证的场景中，这种方式比较适合。

如果要启用HTTP Basic认证的话，只需在configure()方法所传入的HttpSecurity对象上调用httpBasic()即可。另外，还可以通过调用realmName()方法指定域。

```java
http
        .formLogin()// 启用默认的登录页
        .loginPage("/login")
        .and()
        .httpBasic()
        .realmName("Spittr")
        ...
```

#### 启用Remember-me功能

存储在cookie中的token包含用户名、密码、过期时间和一个私钥——在写入cookie前都进行了MD5哈希。默认情况下，私钥的名为SpringSecured，但在这里设置为spitterKey，使它专门用于Spittr应用。

```java
http
        .formLogin()
        .loginPage("/login")
        .and()
        .rememberMe()
        .tokenRepository(new InMemoryTokenRepositoryImpl())
        .tokenValiditySeconds(2419200)
        .key("spittrKey")
        ...
```

登录请求必须包含一个名为remember-me的参数。

```html
<input type="checkbox" name="remember-me"/>
```

#### 退出

退出功能是通过Servlet容器中的Filter实现的（默认情况下），这个Filter会拦截针对“/logout”的请求。

当用户发起对“/logout”的请求，这个请求会被Spring Security的LogoutFilter所处理。用户会退出应用，所有的Remember-me token都会被清除掉。在退出完成后，用户浏览器将会重定向到“/login?logout”，从而允许用户进行再次登录。

```java
http
        .logout()
        .logoutUrl("signout")
        .logoutSuccessUrl("/index")
        ...
```

### 保护视图

#### 使用Spring Security的JSP标签库

Spring Security通过JSP标签库在视图层上支持安全性：

|            JSP标签             |                                      作用                                      |
|--------------------------------|------------------------------------------------------------------------------------|
| `<security:accesscontrollist>` | 如果用户通过访问控制列表授予了指定的权限，那么渲染该标签体中的内容                 |
| `<security:authentication>`    | 渲染当前用户认证对象的详细信息                                                     |
| `<security:authorize>`         | 如果用户被授予了特定的权限或者SpEL表达式的计算结果为true，那么渲染该标签体中的内容 |

```html
<%@ taglib prefix="security" uri="http://www.springframework.org/security/tags" %>
```

**访问认证信息的细节**

使用`<security:authentication>` JSP标签来访问用户的认证详情

|   认证属性  |                       描述                       |
|-------------|--------------------------------------------------|
| authorities | 一组用于表示用户所授予权限的GrantedAuthority对象 |
| Credentials | 用于核实用户的凭证（通常，这会是用户的密码）     |
| details     | 认证的附加信息（IP地址、证件序列号、会话ID等）   |
| principal   | 用户的基本信息对象                               |

```html
Hello,<security:authentication property="principal.username" var="loginId" scope="request"/>!
```

这个变量默认是定义在页面作用域内的。如果你愿意在其他作用域内创建它，可以通过scope属性来声明。

**条件性的渲染内容**

```html
<security:authorize access="hasRole('ROLE_USER')">
    ...
</security:authorize>
```

不像access属性那样明确声明安全性限制，url属性对一个给定的URL模式会间接引用其安全性约束。鉴于我们已经在Spring Security配置中为“/admin”声明了安全性约束，所以我们可以这样使用url属性：

```html
<security:authorize url="/admin">
    ...
</security:authorize>
```

#### 使用Thymeleaf的Spring Security方言

Thymeleaf的安全方言提供了与Spring Security标签库相对应的属性：

|      属性      |                                                        作用                                                       |
|--------------------|-----------------------------------------------------------------------------------------------------------------------|
| sec:authentication | 渲染认证对象的属性。类似于Spring Security的`<sec:authentication/>`JSP标签                                             |
| sec:authorize      | 基于表达式的计算结果，条件性的渲染内容。类似于Spring Security的`<sec:authorize/>`JSP标签                              |
| sec:authorize-acl  | 基于表达式的计算结果，条件性的渲染内容。类似于Spring Security的`<sec:accesscontrollist/>` JSP标签                     |
| sec:authorize-expr | sec:authorize属性的别名                                                                                               |
| sec:authorize-url  | 基于给定URL路径相关的安全规则，条件性的渲染内容。类似于Spring Security的`<sec:authorize/>` JSP标签使用url属性时的场景 |

注册方言：

```java
@Configuration
@EnableWebMvc
@ComponentScan("spittr.web")
public class WebConfig extends WebMvcConfigurerAdapter {
    @Bean
    public ViewResolver viewResolver(SpringTemplateEngine templateEngine) {
        ThymeleafViewResolver viewResolver = new ThymeleafViewResolver();
        viewResolver.setTemplateEngine(templateEngine);
        return viewResolver;
    }
    @Bean
    public SpringTemplateEngine templateEngine(TemplateResolver templateResolver) {
        SpringTemplateEngine templateEngine = new SpringTemplateEngine();
        templateEngine.setTemplateResolver(templateResolver);
        templateEngine.addDialect(new SpringSecurityDialect());// 注册方言
        return templateEngine;
    }
    @Bean
    public TemplateResolver templateResolver() {
        TemplateResolver templateResolver = new ServletContextTemplateResolver();
        templateResolver.setPrefix("/WEB-INF/views/");
        templateResolver.setSuffix(".html");
        templateResolver.setTemplateMode("HTML5");
        return templateResolver;
    }
    @Override
    public void configureDefaultServletHandling(DefaultServletHandlerConfigurer configurer) {
        configurer.enable();
    }
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/login").setViewName("login");
    }
}
```

```html
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:th="http://www.thymeleaf.org"
      xmlns:sec="http://www.thymeleaf.org/thymeleaf-extras-springsecurity3">
<head></head>
<body>
<div sec:authorize="isAuthenticated()">
    Hello there...<span sec:authentication="name">user-name</span>
</div>
<span sec:authorize-url="/admin">
    <a th:href="@{/admin}">Admin</a>
</span>
</body>
</html>
```

### 保护方法

#### 使用注解保护方法

最重要的是当我们在编辑器中查看给定的方法时，能够很清楚地看到它的安全规则。

Spring Security提供了三种不同的安全注解：

* Spring Security自带的@Secured注解；
* JSR-250的@RolesAllowed注解；
* 表达式驱动的注解，包括@PreAuthorize、@PostAuthorize、@PreFilter和@PostFilter。

* @Secured和@RolesAllowed方案非常类似，能够基于用户所授予的权限限制对方法的访问。
* 当我们需要在方法上定义更灵活的安全规则时，Spring Security提供了@PreAuthorize和@PostAuthorize，而@PreFilter/@PostFilter能够过滤方法返回的以及传入方法的集合。

**使用@Secured注解限制方法调用**

```java
@Configuration
@EnableGlobalMethodSecurity(securedEnabled = true)
public class SecuredConfig extends GlobalMethodSecurityConfiguration {
    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth
                .inMemoryAuthentication()
                .withUser("user").password("password").roles("USER");
    }
}
```

继承了GlobalMethodSecurityConfiguration，这个类能够为方法级别的安全性提供更精细的配置。

如果securedEnabled属性的值为true的话，将会创建一个切点，这样的话Spring Security切面就会包装带有@Secured注解的方法。

```java
@Override
@Secured({"ROLE_SPITTER", "ROLE_ADMIN"})
public void addSpittle(Spittle spittle) {
}
```

@Secured注解会使用一个String数组作为参数。每个String值是一个权限，调用这个方法至少需要具备其中的一个权限。

如果方法被没有认证的用户或没有所需权限的用户调用，保护这个方法的切面将抛出一个Spring Security异常（可能是AuthenticationException或AccessDeniedException的子类）。它们是非检查型异常，但这个异常最终必须要被捕获和处理。如果被保护的方法是在Web请求中调用的，这个异常会被Spring Security的过滤器自动处理。否则的话，你需要编写代码来处理这个异常。

@Secured注解的不足之处在于它是Spring特定的注解。

**@RolesAllowed注解**

```java
@Configuration
@EnableGlobalMethodSecurity(jsr250Enabled = true)
public class JSR250Config extends GlobalMethodSecurityConfiguration {
    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth
                .inMemoryAuthentication()
                .withUser("user").password("password").roles("USER");
    }
}
```

尽管我们这里只是启用了jsr250Enabled，但需要说明的一点是这与securedEnabled并不冲突。这两种注解风格可以同时启用。

在将jsr250Enabled设置为true之后，将会启用一个切点，这样带有@RolesAllowed注解的方法都会被Spring Security的切面包装起来。因此，在方法上使用@RolesAllowed的方式与使用@Secured类似。

```java
@Override
@RolesAllowed("ROLE_SPITTER")
public void addSpittle(Spittle spittle) {
}
```

这两个注解有一个共同的不足。它们只能根据用户有没有授予特定的权限来限制方法的调用。在保护URL方面，能够使用SpEL表达式克服这一限制。

#### 使用表达式实现方法级别的安全性

Spring Security 3.0提供了4个新的注解，可以使用SpEL表达式来保护方法调用：

|    注解    |                              描述                             |
|----------------|-------------------------------------------------------------------|
| @PreAuthorize  | 在方法调用之前，基于表达式的计算结果来限制对方法的访问            |
| @PostAuthorize | 允许方法调用，但是如果表达式计算结果为false，将抛出一个安全性异常 |
| @PostFilter    | 允许方法调用，但必须按照表达式来过滤方法的结果                    |
| @PreFilter     | 允许方法调用，但必须在进入方法之前过滤输入值                      |

```java
@Configuration
@EnableGlobalMethodSecurity(prePostEnabled = true)
public class ExpressionSecurityConfig extends GlobalMethodSecurityConfiguration {
    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth
                .inMemoryAuthentication()
                .withUser("user").password("password").roles("USER");
    }
}

```

##### 表述方法访问规则

@PreAuthorize和@PostAuthorize之间的关键区别在于表达式执行的时机。

* @PreAuthorize的表达式会在方法调用之前执行，如果表达式的计算结果不为true的话，将会阻止方法执行。\
* 与之相反，@PostAuthorize的表达式直到方法返回才会执行，然后决定是否抛出安全性的异常。

**在方法调用前验证权限**

```java
@Override
@PreAuthorize("(hasRole('ROLE_SPITTER') and #spittle.text.length() le 140) or hasRole('ROLE_PREMIUM')")
public void addSpittle(Spittle spittle) {
}
```

**在方法调用之后验证权限**

在方法调用之后验证权限并不是比较常见的方式。事后验证一般需要基于安全保护方法的返回值来进行安全性决策。这种情况意味着方法必须被调用执行并且得到了返回值。

```java
@Override
@PostAuthorize("returnObject.spitter.username == principal.username")
public Spittle getSpittleById(Spittle spittle) {
    return null;
}
```

为了便利地访问受保护方法的返回对象，Spring Security在SpEL中提供了名为returnObject的变量。  
表达式到内置的principal对象中取出其username属性。

##### 过滤方法的输入和输出

**事后对方法的返回值进行过滤**

```java
@Override
@PreAuthorize("hasRole('ROLE_SPITTER')  or hasRole('ROLE_ADMIN')")
@PostFilter("hasRole('ROLE_ADMIN') || filterObject.spitter.username == principal.username")
public List<Spittle> getHotSpittleList() {
    return null;
}
```

表达式中的filterObject对象引用的是这个方法所返回List中的某一个元素（我们知道它是一个Spittle）。在这个Spittle对象中，如果Spitter的用户名与认证用户（表达式中的principal.name）相同或者用户具有ROLE_ADMIN角色，那这个元素将会最终包含在过滤后的列表中。否则，它将被过滤掉。

**事先对方法的参数进行过滤**

```java
@Override
@PreAuthorize("hasRole('ROLE_SPITTER')  or hasRole('ROLE_ADMIN')")
@PreFilter("hasRole('ROLE_ADMIN') || filterObject.spitter.username == principal.username")
public void deleteSpittleList(List<Spittle> spittleList) {
}
```

只有满足SpEL表达式的元素才会留在集合中。但是它所过滤的不是方法的返回值，@PreFilter过滤的是要进入方法中的集合成员。

targetObject（高版本spring中都为filterObject）是Spring Security提供的另外一个值，它代表了要进行计算的当前列表元素。

**定义许可计算器**

```java

import org.springframework.security.access.PermissionEvaluator;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import spittr.domain.Spittle;
import java.io.Serializable;
public class SpittlePermissionEvaluator implements PermissionEvaluator {
    private static final GrantedAuthority ADMIN_AUTHORITY = new SimpleGrantedAuthority("ROLE_ADMIN");
    @Override
    public boolean hasPermission(Authentication authentication, Object targetDomainObject, Object permission) {
        if (targetDomainObject instanceof Spittle) {
            Spittle spittle = (Spittle) targetDomainObject;
            String username = spittle.getSpitter().getUsername();
            if ("delete".equals(permission)) {
                return isAdmin(authentication) || username.equals(authentication.getName());
            }
        }
        return false;
    }
    @Override
    public boolean hasPermission(Authentication authentication, Serializable targetId, String targetType, Object permission) {
        throw new UnsupportedOperationException();
    }
    private boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().contains(ADMIN_AUTHORITY);
    }
}
```

默认情况下，Spring Security会配置为使用DefaultMethodSecurityExpression-Handler，它会使用一个DenyAllPermissionEvaluator实例。
DenyAllPermissionEvaluator将会在hasPermission()方法中始终返回false，拒绝所有的方法访问。  
但是，我们可以为Spring Security提供另外一个DefaultMethodSecurityExpressionHandler，让它使用我们自定义的SpittlePermissionEvaluator，这需要重载GlobalMethodSecurityConfiguration的createExpressionHandler方法：

```java
@Configuration
@EnableGlobalMethodSecurity(prePostEnabled = true)
public class ExpressionSecurityConfig extends GlobalMethodSecurityConfiguration {
    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth
                .inMemoryAuthentication()
                .withUser("user").password("password").roles("USER");
    }
    @Override
    protected MethodSecurityExpressionHandler createExpressionHandler() {
        DefaultMethodSecurityExpressionHandler defaultMethodSecurityExpressionHandler = (DefaultMethodSecurityExpressionHandler) super.createExpressionHandler();
        defaultMethodSecurityExpressionHandler.setPermissionEvaluator(new SpittlePermissionEvaluator());
        return defaultMethodSecurityExpressionHandler;
    }
}
```

```java
@Override
@PreAuthorize("hasRole({'ROLE_ADMIN','ROLE_SPITTER'})")
@PreFilter(value = "hasPermission(filterObject,'delete')")
public void deleteSpittleList(List<Spittle> spittleList) {
}
```

------

*以上概念总结于传智播客SpringMVC课程和Spring In Action*