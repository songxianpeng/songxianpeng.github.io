$(function () {
	// $("img").addClass("img-responsive");
	// $("li").addClass("col-md-1 text-center");
	$("ul").addClass("list-inline");
	$("li").addClass("border-left");

	$.each($("fieldset"),function(i,o) {
		$(o).find("li").first().removeClass("border-left");
	});
	$(".box").fadeOut(400, function () {
		$("#divMain").removeClass("hide");
	});
})
$(function () {
	$("#inputFilter").keyup(function () {
		var txt = $("#inputFilter").val();
		if ($.trim(txt) != "") {
			$("fieldset").hide();
			var $shows = $("li").hide().filter(function () {
				return $(this).children("a").children("span").text().toUpperCase().indexOf(txt.toUpperCase()) != -1;
			});
			$shows.show().parents("fieldset").show();
		} else {
			$("li").css("background", "#fff").show();
			$("fieldset").show();
		}
	});
})