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

* DispatcherServlet#doService#doDispatch FrameworkServlet的service方法调用
    - mappedHandler = getHandler(processedRequest);
        + HandlerExecutionChain handler = hm.getHandler(request);
    - HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());
    - mv = ha.handle(processedRequest, response, mappedHandler.getHandler());
    - processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);
        + render(mv, request, response);
            * view = mv.getView();
            * view.render(mv.getModelInternal(), request, response);

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


##### 参数绑定

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
    }  return "myProfile";
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

RESTful（Representational State Transfer表现层状态转化）是一种对URL和http请求的规范，我们用的较多的时对url的规范

* 每一个URI代表一种资源
* 客户端和服务器之间，传递这种资源的某种表现层
* 客户端通过四个HTTP动词，对服务器端资源进行操作，实现"表现层状态转化"

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

根据逻辑视图名解析真正的view

```xml
<!--视图解析器：解析jsp，默认使用jstl标签，classpath下要有jstl包-->
<bean class="org.springframework.web.servlet.view.InternalResourceViewResolver">
    <!--配置jsp前缀和后缀，可以简化返回结果配置-->
    <!--modelAndView.setViewName("myProfile");-->
    <property name="suffix" value=".jsp"/>
    <property name="prefix" value="/WEB-INF/pages/"/>
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

------

*以上概念总结于传智播客SpringMVC课程*