---  
layout: post  
title: Scanner类、String类和StringBuffer类  
tags: Java基础 String StringBuffer StringBuilder  
categories: Java  
published: true  
---  

## Scanner类

### Scanner取值问题

同一个Scanner对象，先获取数值，再获取字符串会出现一个小问题

* 重新定义一个Scanner对象
* 把所有的数据都用字符串获取，然后再进行相应的转换

## String类

### String类的特点

#### 字符串是常量,它的值在创建之后不能更改

* String类被final修饰，不能被继承
* 这里指的是字符串的内容不能改变，而不是引用不能改变。

```java
private final char value[];//源码中的存储值被final修饰，所以值不能改变
```

**String s = “hello”; s += “world”; 问s的结果是多少?**

```java
//一旦被赋值，就不能改变 是值不能被改变，hello不能改变，
String s = "hello";
s += "world";//这里是s=s+world，引用是可以改变的
System.out.println("s:" + s); //helloworld
```

**String s = new String(“hello”)和String s = “hello”;的区别?**

有。前者会创建2个对象，后者创建1个对象。

* 创建new String的堆对象和常量池对象"hello"
* 创建常量池对象"hello"	


#### ==和equls

* 字符串如果是变量相加，先开空间，在拼接。
* 字符串如果是常量相加，是先加，然后在常量池找，如果有就直接返回，否则，就创建。

```java
String s1 = new String("hello");
String s2 = new String("hello");
System.out.println(s1==s2);//false
System.out.println(s1.equals(s2));//true

String s3 = new String("hello");
String s4 = "hello";
System.out.println(s3==s4);//false
System.out.println(s3.equals(s4));//true

String s5 = "hello";
String s6 = "hello";
System.out.println(s5==s6);//true
System.out.println(s5.equals(s6));//true

String s1 = "hello";
String s2 = "world";
String s3 = "helloworld";
System.out.println(s3 == s1 + s2);// false 字符串如果是变量相加，先开空间，在拼接。
System.out.println(s3.equals((s1 + s2)));// true

System.out.println(s3 == "hello" + "world");// true 可以通过Xjad查看class文件。这里编译后是同一个常量
System.out.println(s3.equals("hello" + "world"));// true

```

### split方法

```java
String stringSplit = ",,";
String[] strings = stringSplit.split(",");//默认方法省略空串的返回结果
System.out.println(strings.length);//0
strings = stringSplit.split(",", stringSplit.length() + 1);//这里使用limit参数设置期待返回数组长度
System.out.println(strings.length);//3
```


### compareTo方法

```java
private final char value[];

//字符串会自动转换为一个字符数组。

public int compareTo(String anotherString) {
		//this -- s1 -- "hello"
		//anotherString -- s2 -- "hel"

    int len1 = value.length; //this.value.length--s1.toCharArray().length--5
    int len2 = anotherString.value.length;//s2.value.length -- s2.toCharArray().length--3
    int lim = Math.min(len1, len2); //Math.min(5,3); -- lim=3;
    char v1[] = value; //s1.toCharArray()
    char v2[] = anotherString.value;
    
    //char v1[] = {'h','e','l','l','o'};
    //char v2[] = {'h','e','l'};

    int k = 0;
    while (k < lim) {
        char c1 = v1[k]; //c1='h','e','l'
        char c2 = v2[k]; //c2='h','e','l'
        if (c1 != c2) {
            return c1 - c2;
        }
        k++;
    }
    return len1 - len2; //5-3=2;//返回长度差
}

String s1 = "hello";
String s2 = "hel";
System.out.println(s1.compareTo(s2)); // 2
```

## StringBuffer类

线程安全的可变字符序列

### String,StringBuffer,StringBuilder的区别

* String是内容不可变的，而StringBuffer,StringBuilder都是内容可变的。
* StringBuffer是同步的，数据安全,效率低;StringBuilder是不同步的,数据不安全,效率高

### StringBuffer和数组的区别

* 二者都可以看出是一个容器，装其他的数据。
* StringBuffer的数据最终是一个字符串数据。
* 数组可以放置多种数据，但必须是同一种数据类型的。


### String作为形式参数，StringBuffer作为形式参数

String作为参数传递，效果和基本类型作为参数传递是一样的。

> String和StringBuffer、StringBuilder内部是用char[]来存储字符串的，相当于char[]的包装类，在Java中，包装类的特质就是值操作时体现对应的基本类型的特质，这就是为什么会有传值的效果！

```java
public static void main(String[] args) {
    String s1 = "hello";
    String s2 = "world";
    System.out.println(s1 + "---" + s2);// hello---world
    change(s1, s2);
    System.out.println(s1 + "---" + s2);// hello---world

    StringBuffer sb1 = new StringBuffer("hello");
    StringBuffer sb2 = new StringBuffer("world");
    System.out.println(sb1 + "---" + sb2);// hello---world
    change(sb1, sb2);
    System.out.println(sb1 + "---" + sb2);// hello---worldworld

    StringBuilder sb3 = new StringBuilder("hello");
    StringBuilder sb4 = new StringBuilder("world");
    System.out.println(sb3 + "---" + sb4);// hello---world
    change(sb3, sb4);
    System.out.println(sb3 + "---" + sb4);// hello---worldworld
}

public static void change(StringBuffer sb1, StringBuffer sb2) {
    sb1 = sb2;
    sb2.append(sb1);
}

public static void change(StringBuilder sb1, StringBuilder sb2) {
    sb1 = sb2;
    sb2.append(sb1);
}

public static void change(String s1, String s2) {
    s1 = s2;
    s2 = s1 + s2;
}
```

----------

*以上概念总结于传智播客Java基础课程*